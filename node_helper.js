const NodeHelper = require("node_helper");
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
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
const valueToFullRisk = {
  NONE: "None", TSTM: "General Thunderstorms", MRGL: "Marginal", SLGT: "Slight", ENH: "Enhanced", MDT: "Moderate", HIGH: "High"
};
const valueToRisk = {
        1: "TSTM", 2: "MRGL", 3: "SLGT", 4: "ENH", 5: "MDT", 6: "HIGH"
      };

module.exports = NodeHelper.create({
  start: function() {
    Log.info("Starting node_helper for MMM-SPCOutlook...");
    this._geoJsonCache = new Map();  // keyed by URL string
    this._cachedLat = null;
    this._cachedLon = null;
  },

  // Called when the front-end (MMM-SPCOutlook.js) sends a socket notification
  socketNotificationReceived: async function(notification, payload) {
    if (notification === "GET_SPC_DATA") {
      const { lat, lon, extended } = payload;
      const md = await this.getMesoscaleDiscussion(lat, lon);
      const outlook = await this.getSpcOutlook(lat, lon, extended);
      // Send the results back to your front-end module
      this.sendSocketNotification("SPC_DATA_RESULT", [outlook, md]);
    }
  },

  async fetchBinBuffer(url){
    const res = await fetch(url);
    if(!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  },

  kmzToKmlfilename(url) {
    const segments = url.split("/");
    const kmzFileName = segments[segments.length-1];
    return kmzFileName.slice(0,-1)+"l";
  },

  extractKmlFromKmz(buffer, filename){
    const ZIPper = new ZIP(buffer);
    const entry = ZIPper.getEntry(filename);
    if(!entry) throw new Error('KMZ downloaded has no KML');
    return ZIPper.readFile(entry).toString();
  },

  parseNetworkLinks(kmlText) {
    const doc = new DOMParser().parseFromString(kmlText, "text/xml");
    const nodes = select("//k:NetworkLink/k:Link/k:href/text()", doc);
    const MDS = nodes.map(n => n.nodeValue.trim());
    return MDS;
  },

  kmlToGeoJson(kmlText) {
    const doc = new DOMParser().parseFromString(kmlText, "text/xml");
    const gj  = KMLtoGJ.kml(doc);
    return gj;
  },

  // Polygons
  /**
   * Extract polygon features from a GeoJSON object, mapping labels to numeric values.
   * @param geojson - GeoJSON FeatureCollection containing Polygon and/or MultiPolygon features
   * @param toValue - function mapping a feature's LABEL string to a numeric value
   * @param includesFeat - predicate (label, value) => boolean; feature is included when true
   * @returns array of { label, value, poly } objects for features that pass the predicate
   */
  extractPolygons(geojson, toValue, includesFeat){
    const polygons = [];
    geojson.features.forEach(f =>{
      const label = f.properties.LABEL || "";
      const value = toValue(label);
      if (!includesFeat(label, value)) return;

      let poly;
      if (f.geometry.type === "Polygon") { poly = turf.polygon(f.geometry.coordinates);}
      else if (f.geometry.type === "MultiPolygon") { poly = turf.multiPolygon(f.geometry.coordinates);}
      else return;
      polygons.push({ label, value, poly });
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
      result = turf.booleanPointInPolygon(loc, poly);
      if(result){
        best = comparator.comparator(best, value);
      }
    });
    return best;
  },

  /**
   * Evaluate polygon items with exponential distance-weighted blending near higher-risk zones.
   * @param items - array of { label, value, poly } from extractPolygons
   * @param loc - turf point representing the query location
   * @param comparator - object with { initial, comparator(best, value) } shape
   * @param transitionDistance - miles over which weighting decays (default 30)
   * @returns blended numeric risk value accounting for proximity to higher-risk polygons
   */
  evaluatePolygonsWeighted(items, loc, comparator, transitionDistance = 30){
    let best = comparator.initial;
    let minDist = Infinity;
    let higherRisk = null;
    // First get polygon-based risk
    items.forEach(({value, poly}) => {
      if(result){
        best = comparator.comparator(best, value);
      }
    });
    const lamba = Math.log(100) / transitionDistance;

    let num = best;
    let den = 1;

    items.forEach(({value, poly}) => {
      if (value >= best) {
        const d = turf.pointToPolygonDistance(loc, poly, { units: "miles"});
        if (d <= transitionDistance) {
          const w = Math.exp(-lambda * d);
          num += value * w;
          den += w;
        }
      }; 
    });
    if (den === 0) return 0;
    return num / den;
  },

  /**
   * Evaluate polygon items with continuous exponential decay toward the nearest higher-risk zone.
   * @param items - array of { label, value, poly } from extractPolygons
   * @param loc - turf point representing the query location
   * @param comparator - object with { initial, comparator(best, value) } shape
   * @param transitionDistance - miles within which decay blending is applied (default 30)
   * @returns numeric risk value blended with proximity perturbation toward the next risk level
   */
  evaluatePolygonsContinuous(items, loc, comparator, transitionDistance = 30){
    let best = comparator.initial;
    let minDist = Infinity;
    let higherRisk = null;
    // First get polygon-based risk
    items.forEach(({label, value, poly}) => {
      if (turf.booleanPointInPolygon(loc, poly)) best = comparator.comparator(best, value);
      if (value > best){
        minDistTest = turf.pointToPolygonDistance(loc, poly, {units: "miles"});
        if(minDistTest < transitionDistance) {
          minDist = minDistTest;
          higherRisk = value;
        }
      }
    });

    // Now use continous decay to calcuate how close to next highest risk
    if(higherRisk && minDist < transitionDistance) {
      const lambda = Math.log(100) / transitionDistance;
      const pertibation = (higherRisk - best) * Math.exp(-lambda * minDist);
      return best + pertibation;
    }
    return best;
  },

  /**
   * Fetch the SPC Active Mesoscale Discussion KMZ and return discussion names that cover the given location.
   * @param lat - latitude of the user location
   * @param lon - longitude of the user location
   * @returns array of MD name strings that apply to the location, or false if none are active
   */
  async getMesoscaleDiscussion(lat,lon){
    const ActiveURL = "https://www.spc.noaa.gov/products/md/ActiveMD.kmz"
    const ActiveKMZ = await this.fetchBinBuffer(ActiveURL);
    const ActiveKML = this.extractKmlFromKmz(ActiveKMZ, "ActiveMD.kml");
    const MDURLs = this.parseNetworkLinks(ActiveKML);
    if(MDURLs.length == 0) return false;
    const MDArray = [];
    for(const MDURL of MDURLs){
      const MDKMZ = await this.fetchBinBuffer(MDURL);
      const MDKML = this.extractKmlFromKmz(MDKMZ, this.kmzToKmlfilename(MDURL));
      const MDgj = this.kmlToGeoJson(MDKML);
      const MDApplies = this.checkInPolygon(MDgj, lat, lon);
      if(MDApplies) MDArray.push(MDgj.features[0].properties.name);
    }
    Log.info("SPC-Outlook MDArray: " + MDArray);
    if (MDArray.length == 0) return false;
    return MDArray;
  },

  
  //Day3+ % => risk
  percToRisk(pct, isSig){
    if (pct == 0.45) return isSig ? "MDT" : "ENH";
    if (pct == 0.30) return "ENH";
    if (pct == 0.15) return "SLGT";
    if (pct == 0.05) return "MRGL";
    return "NONE";
  },

  async fetchGeoJson(url){
    try {
      const result = await fetch(url);
      if(!result.ok) throw new Error(`HTTP ${result.status} fetching ${url}`);
      const data = await result.json();
      return data;
    } catch (err) {
      Log.error("MMM-SPCOutlook fetchGeoJson error:", err);
      return null;
    }
  },

  _isWithinStaleWindow(timestamp) {
    const intervalMs = (this.config?.updateInterval ?? 60) * 60 * 1000;
    return (Date.now() - timestamp) < intervalMs;
  },

  /**
   * Fetch a GeoJSON URL with ETag/hash caching, returning parsed data or cached result on hit/error.
   * @param url - GeoJSON endpoint URL to fetch
   * @returns object with { data, cachedResult, stale, mode, newEtag, newHash } — data is null on cache hit or error
   */
  async fetchGeoJsonCached(url) {
    const entry = this._geoJsonCache.get(url);

    const headers = {};
    if (entry && entry.mode === 'etag' && entry.etag) {
      headers['If-None-Match'] = entry.etag;
    }

    let res;
    try {
      res = await fetch(url, { headers });
    } catch (err) {
      // Network error
      if (entry && this._isWithinStaleWindow(entry.timestamp)) {
        Log.info('MMM-SPCOutlook: stale fallback for ' + url);
        return { data: null, cachedResult: entry.result, stale: true };
      }
      return { data: null, cachedResult: null, stale: false };
    }

    // 304 Not Modified — ETag cache hit (no body, must check before res.text())
    if (res.status === 304) {
      Log.info('MMM-SPCOutlook: cache hit (ETag) for ' + url);
      return { data: null, cachedResult: entry.result, stale: false };
    }

    // Non-ok HTTP response (not 304)
    if (!res.ok) {
      if (entry && this._isWithinStaleWindow(entry.timestamp)) {
        Log.info('MMM-SPCOutlook: stale fallback for ' + url);
        return { data: null, cachedResult: entry.result, stale: true };
      }
      return { data: null, cachedResult: null, stale: false };
    }

    // HTTP 200 — read raw text
    const rawText = await res.text();
    const newEtag = res.headers.get('etag');

    if (newEtag) {
      // ETag mode — skip hash computation
      // If same ETag as cached, it's a hit (server didn't send 304, but ETag matches)
      if (entry && entry.mode === 'etag' && entry.etag === newEtag) {
        Log.info('MMM-SPCOutlook: cache hit (ETag) for ' + url);
        return { data: null, cachedResult: entry.result, stale: false };
      }
      // Cache miss — parse and return new data
      const data = JSON.parse(rawText);
      return { data, rawText, newEtag, newHash: null, mode: 'etag' };
    } else {
      // Hash mode — compute SHA256 of raw text
      const newHash = crypto.createHash('sha256').update(rawText).digest('hex');
      if (entry && entry.mode === 'hash' && entry.hash === newHash) {
        Log.info('MMM-SPCOutlook: cache hit (hash) for ' + url);
        return { data: null, cachedResult: entry.result, stale: false };
      }
      // Cache miss — parse and return new data
      const data = JSON.parse(rawText);
      return { data, rawText, newEtag: null, newHash, mode: 'hash' };
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

    const fetchResult = await this.fetchGeoJsonCached(url);
    if (fetchResult.stale) stale = true;

    if (fetchResult.data === null && fetchResult.cachedResult !== null) {
      risk = fetchResult.cachedResult;
    } else if (fetchResult.data !== null) {
      const poly = this.extractPolygons(
        fetchResult.data,
        label => label === "" ? 0 : parseFloat(label),
        (label, val) => val > 0
      );
      risk = this.evaluatePolygons(poly, loc, percComparator);
      this._geoJsonCache.set(url, {
        mode: fetchResult.mode,
        etag: fetchResult.newEtag ?? null,
        hash: fetchResult.newHash ?? null,
        result: risk,
        timestamp: Date.now()
      });
    }

    if (risk > 0) {
      const cigFetch = await this.fetchGeoJsonCached(cigUrl);
      if (cigFetch.stale) stale = true;
      if (cigFetch.data === null && cigFetch.cachedResult !== null) {
        cig = cigFetch.cachedResult;
      } else if (cigFetch.data !== null) {
        const cigPolys = this.extractPolygons(
          cigFetch.data,
          label => cigToTier[label] || 0,
          (label, val) => val > 0
        );
        cig = this.evaluatePolygons(cigPolys, loc, cigComparator);
        this._geoJsonCache.set(cigUrl, {
          mode: cigFetch.mode,
          etag: cigFetch.newEtag ?? null,
          hash: cigFetch.newHash ?? null,
          result: cig,
          timestamp: Date.now()
        });
      }
    }

    return { risk, cig, stale };
  },

  /**
   * Fetch and evaluate all SPC outlook layers for the given location, returning structured risk data.
   * @param lat - latitude of the user location
   * @param lon - longitude of the user location
   * @param extended - when true, also fetch Days 4-8 outlook data
   * @returns object with day1, day2, day3 (and optionally day4-8) outlook data, each containing:
   *   risk (string), text (string), color (hex string), probRisk (boolean),
   *   torRisk (number), torCig (number), hailRisk (number), hailCig (number),
   *   windRisk (number), windCig (number) for days 1-2;
   *   probRisk (number) and cig (number) for day3;
   *   probRisk (number), sign (boolean), risk (string), color, text for days 4-8;
   *   fireWeather with day1Risk/day1Text/day2Risk/day2Text;
   *   and optional _stale (boolean) and _staleAsOf (timestamp) when serving cached data
   */
  async getSpcOutlook(lat, lon, extended) {
    try {
      // Part A: Location change invalidation
      const locationChanged = (lat !== this._cachedLat || lon !== this._cachedLon);
      if (locationChanged) {
        for (const [url, entry] of this._geoJsonCache) {
          this._geoJsonCache.set(url, { ...entry, result: null, timestamp: 0 });
        }
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
      // Part B: sigComparator — fixes latent ReferenceError in extended mode
      const sigComparator = { initial: false, comparator: (best, val) => true };

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

      let anyStale = false;

      //Day 1

      //Day 1 Cat
      let day1RiskResult;
      let day1Risk;
      {
        const fetchResult = await this.fetchGeoJsonCached(day1CatURL);
        if (fetchResult.stale) anyStale = true;
        if (fetchResult.data === null && fetchResult.cachedResult !== null) {
          day1RiskResult = fetchResult.cachedResult;
        } else if (fetchResult.data === null) {
          day1RiskResult = 0;
        } else {
          const gj = fetchResult.data;
          const day1RiskPoly = this.extractPolygons(gj, label => riskToValue[label] || 0, (label, val) => val > 0);
          day1RiskResult = this.evaluatePolygons(day1RiskPoly, loc, catComparator);
          this._geoJsonCache.set(day1CatURL, { mode: fetchResult.mode, etag: fetchResult.newEtag ?? null, hash: fetchResult.newHash ?? null, result: day1RiskResult, timestamp: Date.now() });
        }
        day1Risk = day1RiskResult === 0 ? "NONE" : valueToRisk[day1RiskResult];
      }
  
      // Day 1 Torn
      const { risk: day1TorRisk, cig: day1TorCig, stale: s1Tor } =
        await this.fetchAndEvaluateHazard(day1TorURL, day1CigTorURL, loc, percComparator, cigComparator, cigToTier);
      if (s1Tor) anyStale = true;

      // Day 1 Hail
      const { risk: day1HailRisk, cig: day1HailCig, stale: s1Hail } =
        await this.fetchAndEvaluateHazard(day1HailURL, day1CigHailURL, loc, percComparator, cigComparator, cigToTier);
      if (s1Hail) anyStale = true;

      // Day 1 Wind
      const { risk: day1WindRisk, cig: day1WindCig, stale: s1Wind } =
        await this.fetchAndEvaluateHazard(day1WindURL, day1CigWindURL, loc, percComparator, cigComparator, cigToTier);
      if (s1Wind) anyStale = true;

      // If Day 1 Risk at all
      const day1ProbRisk = day1TorRisk > 0 || day1HailRisk > 0 || day1WindRisk > 0;

      // Day 2

      //Day 2 Cat
      let day2RiskResult;
      let day2Risk;
      {
        const fetchResult = await this.fetchGeoJsonCached(day2CatURL);
        if (fetchResult.stale) anyStale = true;
        if (fetchResult.data === null && fetchResult.cachedResult !== null) {
          day2RiskResult = fetchResult.cachedResult;
        } else if (fetchResult.data === null) {
          day2RiskResult = 0;
        } else {
          const gj = fetchResult.data;
          const poly = this.extractPolygons(gj, label => riskToValue[label] || 0, (label, val) => val > 0);
          day2RiskResult = this.evaluatePolygons(poly, loc, catComparator);
          this._geoJsonCache.set(day2CatURL, { mode: fetchResult.mode, etag: fetchResult.newEtag ?? null, hash: fetchResult.newHash ?? null, result: day2RiskResult, timestamp: Date.now() });
        }
        day2Risk = day2RiskResult === 0 ? "NONE" : valueToRisk[day2RiskResult];
      }

      // Day 2 Torn
      const { risk: day2TorRisk, cig: day2TorCig, stale: s2Tor } =
        await this.fetchAndEvaluateHazard(day2TorURL, day2CigTorURL, loc, percComparator, cigComparator, cigToTier);
      if (s2Tor) anyStale = true;

      // Day 2 Hail
      const { risk: day2HailRisk, cig: day2HailCig, stale: s2Hail } =
        await this.fetchAndEvaluateHazard(day2HailURL, day2CigHailURL, loc, percComparator, cigComparator, cigToTier);
      if (s2Hail) anyStale = true;

      // Day 2 Wind
      const { risk: day2WindRisk, cig: day2WindCig, stale: s2Wind } =
        await this.fetchAndEvaluateHazard(day2WindURL, day2CigWindURL, loc, percComparator, cigComparator, cigToTier);
      if (s2Wind) anyStale = true;

      // If Day 2 Risk at all
      const day2ProbRisk = day2TorRisk > 0 || day2HailRisk > 0 || day2WindRisk > 0;

      //DAY 3
      //Day 3 Cat
      let day3RiskResult;
      let day3Risk;
      {
        const fetchResult = await this.fetchGeoJsonCached(day3CatURL);
        if (fetchResult.stale) anyStale = true;
        if (fetchResult.data === null && fetchResult.cachedResult !== null) {
          day3RiskResult = fetchResult.cachedResult;
        } else if (fetchResult.data === null) {
          day3RiskResult = 0;
        } else {
          const gj = fetchResult.data;
          const poly = this.extractPolygons(gj, label => riskToValue[label] || 0, (label, val) => val > 0);
          day3RiskResult = this.evaluatePolygons(poly, loc, catComparator);
          this._geoJsonCache.set(day3CatURL, { mode: fetchResult.mode, etag: fetchResult.newEtag ?? null, hash: fetchResult.newHash ?? null, result: day3RiskResult, timestamp: Date.now() });
        }
        day3Risk = day3RiskResult === 0 ? "NONE" : valueToRisk[day3RiskResult];
      }

      // Day 3 Prob
      let day3ProbRisk;
      {
        const fetchResult = await this.fetchGeoJsonCached(day3ProbURL);
        if (fetchResult.stale) anyStale = true;
        if (fetchResult.data === null && fetchResult.cachedResult !== null) {
          day3ProbRisk = fetchResult.cachedResult;
        } else if (fetchResult.data === null) {
          day3ProbRisk = 0;
        } else {
          const gj = fetchResult.data;
          const poly = this.extractPolygons(gj, label => label === "" ? 0 : parseFloat(label), (label, val) => val > 0);
          day3ProbRisk = this.evaluatePolygons(poly, loc, percComparator);
          this._geoJsonCache.set(day3ProbURL, { mode: fetchResult.mode, etag: fetchResult.newEtag ?? null, hash: fetchResult.newHash ?? null, result: day3ProbRisk, timestamp: Date.now() });
        }
      }
      let day3Cig = 0;
      if (day3ProbRisk > 0) {
        const fetchResult = await this.fetchGeoJsonCached(day3CigUrl);
        if (fetchResult.stale) anyStale = true;
        if (fetchResult.data === null && fetchResult.cachedResult !== null) {
          day3Cig = fetchResult.cachedResult;
        } else if (fetchResult.data !== null) {
          const cigPolys = this.extractPolygons(fetchResult.data, label => cigToTier[label] || 0, (label, val) => val > 0);
          day3Cig = this.evaluatePolygons(cigPolys, loc, cigComparator);
          this._geoJsonCache.set(day3CigUrl, { mode: fetchResult.mode, etag: fetchResult.newEtag ?? null, hash: fetchResult.newHash ?? null, result: day3Cig, timestamp: Date.now() });
        }
      }

      // Fire Weather constants
      const day1FwWindRHURL = "https://www.spc.noaa.gov/products/fire_wx/day1fw_windrh.lyr.geojson";
      const day1FwDryTURL   = "https://www.spc.noaa.gov/products/fire_wx/day1fw_dryt.lyr.geojson";
      const day2FwWindRHURL = "https://www.spc.noaa.gov/products/fire_wx/day2fw_windrh.lyr.geojson";
      const day2FwDryTURL   = "https://www.spc.noaa.gov/products/fire_wx/day2fw_dryt.lyr.geojson";
      const fireRiskToValue = { ELEV: 1, CRIT: 2, EXTM: 3 };
      const fireValueToFull = { 0: "None", 1: "Elevated", 2: "Critical", 3: "Extremely Critical" };
      const fireComparator  = { initial: 0, comparator: (best, val) => Math.max(best, val) };

      // Fire Weather Day 1
      let day1FireRisk = 0;
      {
        const fetchResult = await this.fetchGeoJsonCached(day1FwWindRHURL);
        if (fetchResult.stale) anyStale = true;
        if (fetchResult.data === null && fetchResult.cachedResult !== null) {
          day1FireRisk = Math.max(day1FireRisk, fetchResult.cachedResult);
        } else if (fetchResult.data !== null) {
          const polys = this.extractPolygons(fetchResult.data, label => fireRiskToValue[label] || 0, (label, val) => val > 0);
          const val = this.evaluatePolygons(polys, loc, fireComparator);
          day1FireRisk = Math.max(day1FireRisk, val);
          this._geoJsonCache.set(day1FwWindRHURL, { mode: fetchResult.mode, etag: fetchResult.newEtag ?? null, hash: fetchResult.newHash ?? null, result: val, timestamp: Date.now() });
        }
      }
      {
        const fetchResult = await this.fetchGeoJsonCached(day1FwDryTURL);
        if (fetchResult.stale) anyStale = true;
        if (fetchResult.data === null && fetchResult.cachedResult !== null) {
          day1FireRisk = Math.max(day1FireRisk, fetchResult.cachedResult);
        } else if (fetchResult.data !== null) {
          const polys = this.extractPolygons(fetchResult.data, label => fireRiskToValue[label] || 0, (label, val) => val > 0);
          const val = this.evaluatePolygons(polys, loc, fireComparator);
          day1FireRisk = Math.max(day1FireRisk, val);
          this._geoJsonCache.set(day1FwDryTURL, { mode: fetchResult.mode, etag: fetchResult.newEtag ?? null, hash: fetchResult.newHash ?? null, result: val, timestamp: Date.now() });
        }
      }

      // Fire Weather Day 2
      let day2FireRisk = 0;
      {
        const fetchResult = await this.fetchGeoJsonCached(day2FwWindRHURL);
        if (fetchResult.stale) anyStale = true;
        if (fetchResult.data === null && fetchResult.cachedResult !== null) {
          day2FireRisk = Math.max(day2FireRisk, fetchResult.cachedResult);
        } else if (fetchResult.data !== null) {
          const polys = this.extractPolygons(fetchResult.data, label => fireRiskToValue[label] || 0, (label, val) => val > 0);
          const val = this.evaluatePolygons(polys, loc, fireComparator);
          day2FireRisk = Math.max(day2FireRisk, val);
          this._geoJsonCache.set(day2FwWindRHURL, { mode: fetchResult.mode, etag: fetchResult.newEtag ?? null, hash: fetchResult.newHash ?? null, result: val, timestamp: Date.now() });
        }
      }
      {
        const fetchResult = await this.fetchGeoJsonCached(day2FwDryTURL);
        if (fetchResult.stale) anyStale = true;
        if (fetchResult.data === null && fetchResult.cachedResult !== null) {
          day2FireRisk = Math.max(day2FireRisk, fetchResult.cachedResult);
        } else if (fetchResult.data !== null) {
          const polys = this.extractPolygons(fetchResult.data, label => fireRiskToValue[label] || 0, (label, val) => val > 0);
          const val = this.evaluatePolygons(polys, loc, fireComparator);
          day2FireRisk = Math.max(day2FireRisk, val);
          this._geoJsonCache.set(day2FwDryTURL, { mode: fetchResult.mode, etag: fetchResult.newEtag ?? null, hash: fetchResult.newHash ?? null, result: val, timestamp: Date.now() });
        }
      }

      if (!extended)
      {
        return {
          ...(anyStale ? { _stale: true, _staleAsOf: Date.now() } : {}),
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
           "windCig": day1WindCig
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
            "windCig": day2WindCig
          },
          day3: {
          "risk": day3Risk,
          "text": valueToFullRisk[day3Risk],
          "color": riskToColor[day3Risk],
          "probRisk": day3ProbRisk,
          "cig": day3Cig
          },
          fireWeather: {
            day1Risk: day1FireRisk,
            day1Text: fireValueToFull[day1FireRisk],
            day2Risk: day2FireRisk,
            day2Text: fireValueToFull[day2FireRisk]
          }
        };
      }

      // Day 4 — PERF-02: single-pass extractPolygons for both risk and SIGN before evaluatePolygons
      let day4ProbRisk, day4Sign;
      {
        const fetch4 = await this.fetchGeoJsonCached(day4URL);
        if (fetch4.stale) anyStale = true;
        if (fetch4.data === null && fetch4.cachedResult !== null) {
          day4ProbRisk = fetch4.cachedResult.probRisk;
          day4Sign = fetch4.cachedResult.sign;
        } else if (fetch4.data === null) {
          day4ProbRisk = 0;
          day4Sign = false;
        } else {
          const gj = fetch4.data;
          const day4RiskPoly = this.extractPolygons(gj, label => label === "" ? 0 : parseFloat(label), (label, val) => val > 0);
          const day4SignPoly  = this.extractPolygons(gj, label => label, (label, val) => label === "SIGN");
          day4ProbRisk = this.evaluatePolygons(day4RiskPoly, loc, percComparator);
          day4Sign = day4ProbRisk > 0 ? this.evaluatePolygons(day4SignPoly, loc, sigComparator) : false;
          this._geoJsonCache.set(day4URL, { mode: fetch4.mode, etag: fetch4.newEtag ?? null, hash: fetch4.newHash ?? null, result: { probRisk: day4ProbRisk, sign: day4Sign }, timestamp: Date.now() });
        }
      }
      const day4Risk = this.percToRisk(day4ProbRisk, day4Sign);

      // Day 5
      let day5ProbRisk, day5Sign;
      {
        const fetch5 = await this.fetchGeoJsonCached(day5URL);
        if (fetch5.stale) anyStale = true;
        if (fetch5.data === null && fetch5.cachedResult !== null) {
          day5ProbRisk = fetch5.cachedResult.probRisk;
          day5Sign = fetch5.cachedResult.sign;
        } else if (fetch5.data === null) {
          day5ProbRisk = 0;
          day5Sign = false;
        } else {
          const gj = fetch5.data;
          const day5RiskPoly = this.extractPolygons(gj, label => label === "" ? 0 : parseFloat(label), (label, val) => val > 0);
          const day5SignPoly  = this.extractPolygons(gj, label => label, (label, val) => label === "SIGN");
          day5ProbRisk = this.evaluatePolygons(day5RiskPoly, loc, percComparator);
          day5Sign = day5ProbRisk > 0 ? this.evaluatePolygons(day5SignPoly, loc, sigComparator) : false;
          this._geoJsonCache.set(day5URL, { mode: fetch5.mode, etag: fetch5.newEtag ?? null, hash: fetch5.newHash ?? null, result: { probRisk: day5ProbRisk, sign: day5Sign }, timestamp: Date.now() });
        }
      }
      const day5Risk = this.percToRisk(day5ProbRisk, day5Sign);

      // Day 6
      let day6ProbRisk, day6Sign;
      {
        const fetch6 = await this.fetchGeoJsonCached(day6URL);
        if (fetch6.stale) anyStale = true;
        if (fetch6.data === null && fetch6.cachedResult !== null) {
          day6ProbRisk = fetch6.cachedResult.probRisk;
          day6Sign = fetch6.cachedResult.sign;
        } else if (fetch6.data === null) {
          day6ProbRisk = 0;
          day6Sign = false;
        } else {
          const gj = fetch6.data;
          const day6RiskPoly = this.extractPolygons(gj, label => label === "" ? 0 : parseFloat(label), (label, val) => val > 0);
          const day6SignPoly  = this.extractPolygons(gj, label => label, (label, val) => label === "SIGN");
          day6ProbRisk = this.evaluatePolygons(day6RiskPoly, loc, percComparator);
          day6Sign = day6ProbRisk > 0 ? this.evaluatePolygons(day6SignPoly, loc, sigComparator) : false;
          this._geoJsonCache.set(day6URL, { mode: fetch6.mode, etag: fetch6.newEtag ?? null, hash: fetch6.newHash ?? null, result: { probRisk: day6ProbRisk, sign: day6Sign }, timestamp: Date.now() });
        }
      }
      const day6Risk = this.percToRisk(day6ProbRisk, day6Sign);

      // Day 7
      let day7ProbRisk, day7Sign;
      {
        const fetch7 = await this.fetchGeoJsonCached(day7URL);
        if (fetch7.stale) anyStale = true;
        if (fetch7.data === null && fetch7.cachedResult !== null) {
          day7ProbRisk = fetch7.cachedResult.probRisk;
          day7Sign = fetch7.cachedResult.sign;
        } else if (fetch7.data === null) {
          day7ProbRisk = 0;
          day7Sign = false;
        } else {
          const gj = fetch7.data;
          const day7RiskPoly = this.extractPolygons(gj, label => label === "" ? 0 : parseFloat(label), (label, val) => val > 0);
          const day7SignPoly  = this.extractPolygons(gj, label => label, (label, val) => label === "SIGN");
          day7ProbRisk = this.evaluatePolygons(day7RiskPoly, loc, percComparator);
          day7Sign = day7ProbRisk > 0 ? this.evaluatePolygons(day7SignPoly, loc, sigComparator) : false;
          this._geoJsonCache.set(day7URL, { mode: fetch7.mode, etag: fetch7.newEtag ?? null, hash: fetch7.newHash ?? null, result: { probRisk: day7ProbRisk, sign: day7Sign }, timestamp: Date.now() });
        }
      }
      const day7Risk = this.percToRisk(day7ProbRisk, day7Sign);

      // Day 8
      let day8ProbRisk, day8Sign;
      {
        const fetch8 = await this.fetchGeoJsonCached(day8URL);
        if (fetch8.stale) anyStale = true;
        if (fetch8.data === null && fetch8.cachedResult !== null) {
          day8ProbRisk = fetch8.cachedResult.probRisk;
          day8Sign = fetch8.cachedResult.sign;
        } else if (fetch8.data === null) {
          day8ProbRisk = 0;
          day8Sign = false;
        } else {
          const gj = fetch8.data;
          const day8RiskPoly = this.extractPolygons(gj, label => label === "" ? 0 : parseFloat(label), (label, val) => val > 0);
          const day8SignPoly  = this.extractPolygons(gj, label => label, (label, val) => label === "SIGN");
          day8ProbRisk = this.evaluatePolygons(day8RiskPoly, loc, percComparator);
          day8Sign = day8ProbRisk > 0 ? this.evaluatePolygons(day8SignPoly, loc, sigComparator) : false;
          this._geoJsonCache.set(day8URL, { mode: fetch8.mode, etag: fetch8.newEtag ?? null, hash: fetch8.newHash ?? null, result: { probRisk: day8ProbRisk, sign: day8Sign }, timestamp: Date.now() });
        }
      }
      const day8Risk = this.percToRisk(day8ProbRisk, day8Sign);

      let day48Risk = false;
      if(day4ProbRisk > 0 || day5ProbRisk > 0 || day6ProbRisk > 0 || day7ProbRisk > 0 || day8ProbRisk > 0) day48Risk = true;

      return {
        ...(anyStale ? { _stale: true, _staleAsOf: Date.now() } : {}),
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
           "windCig": day1WindCig
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
            "windCig": day2WindCig
          },
          day3: {
          "risk": day3Risk,
          "text": valueToFullRisk[day3Risk],
          "color": riskToColor[day3Risk],
          "probRisk": day3ProbRisk,
          "cig": day3Cig
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
          day2Text: fireValueToFull[day2FireRisk]
        }
      };

    } catch (err) {
      Log.error("Error fetching or parsing SPC data", err);
      return { error: err.toString() };
    }
  },

  checkInPolygon(geojson, lat, lon){
    const pt = turf.point([lon, lat]);
    for (const feature of geojson.features) {
      if (!feature.geometry) continue;

      const geomType = feature.geometry.type;
      if (geomType === "Polygon") {
        const poly = turf.polygon(feature.geometry.coordinates);
        if (turf.booleanPointInPolygon(pt, poly)) return true;
      }
      else if (geomType === "MultiPolygon") {
        const multiPoly = turf.multiPolygon(feature.geometry.coordinates);
        if (turf.booleanPointInPolygon(pt, multiPoly)) return true;
      }
    }
    return false;
  },

//   checkDayCat(geojson, lat, lon, riskToValue, valueToRisk) {
//     let highestValue = 0;
//     const pt = turf.point([lon, lat]);

//     for (const feature of geojson.features) {
//       if (!feature.geometry) continue;

//       // For polygons vs multipolygons:
//       const geomType = feature.geometry.type;
//       const label = feature.properties.LABEL; // e.g., "SLGT", "ENH", etc.
//       const labelValue = riskToValue[label] || 0;

//       if (geomType === "Polygon") {
//         const poly = turf.polygon(feature.geometry.coordinates);
//         if (turf.booleanPointInPolygon(pt, poly) && labelValue > highestValue) {
//           highestValue = labelValue;
//         }
//       } else if (geomType === "MultiPolygon") {
//         const multiPoly = turf.multiPolygon(feature.geometry.coordinates);
//         if (turf.booleanPointInPolygon(pt, multiPoly) && labelValue > highestValue) {
//           highestValue = labelValue;
//         }
//       }
//     }
//     return highestValue === 0 ? "NONE" : valueToRisk[highestValue];
//   },

//   checkDayPerc(geojson, lat, lon) {
//     let highestValue = 0;
//     const pt = turf.point([lon, lat]);

//     for (const feature of geojson.features) {
//       if (!feature.geometry) continue;

//       // For polygons vs multipolygons:
//       const geomType = feature.geometry.type;
//       const labelValue = feature.properties.LABEL;

//       if (geomType === "Polygon") {
//         const poly = turf.polygon(feature.geometry.coordinates);
//         if (turf.booleanPointInPolygon(pt, poly) && labelValue > highestValue && labelValue != "SIGN") {
//           highestValue = labelValue;
//         }
//       } else if (geomType === "MultiPolygon") {
//         const multiPoly = turf.multiPolygon(feature.geometry.coordinates);
//         if (turf.booleanPointInPolygon(pt, multiPoly) && labelValue > highestValue && labelValue != "SIGN") {
//           highestValue = labelValue;
//         }
//       }
//     }
//     return highestValue
//   },

//   checkDaySign(geojson, lat, lon) {
//   const pt = turf.point([lon, lat]);
//   for (const feature of geojson.features) {
//     if (!feature.geometry) continue;
//     // Only process features that are flagged as SIG
//     if (feature.properties.LABEL === "SIGN") {
//       let polygon;
//       if (feature.geometry.type === "Polygon") {
//         polygon = turf.polygon(feature.geometry.coordinates);
//       } else if (feature.geometry.type === "MultiPolygon") {
//         polygon = turf.multiPolygon(feature.geometry.coordinates);
//       }
//       if (turf.booleanPointInPolygon(pt, polygon)) {
//         return true;
//       }
//     }
//   }
//   return false;
// }
});