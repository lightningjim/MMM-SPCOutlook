const NodeHelper = require("node_helper");
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
const turf = require("@turf/turf"); // or another geometry librarykmz-
const Log = require("logger");
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
  },

  // Called when the front-end (MMM-SPCOutlook.js) sends a socket notification
  socketNotificationReceived: async function(notification, payload) {
    if (notification === "GET_SPC_DATA") {
      //Log.info("SPC Outlook: GET_SPC_DATA GET")
      const { lat, lon, extended } = payload;
      //Log.info("SPC-Outlook - intermediate payload" + lat + " " + lon + " " + extended); 
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
    //Log.info("SPC-Outlook: " + ZIPper.readFile(entry))
    return ZIPper.readFile(entry).toString();
  },

  parseNetworkLinks(kmlText) {
    const doc = new DOMParser().parseFromString(kmlText, "text/xml");
    //Log.info("SPC-Outlook: Parsed DOM" + doc);
    const nodes = select("//k:NetworkLink/k:Link/k:href/text()", doc);
    const MDS = nodes.map(n => n.nodeValue.trim());
    //Log.info("SPC‑Outlook: Nodes –", JSON.stringify(MDS));
    return MDS;
  },

  kmlToGeoJson(kmlText) {
    const doc = new DOMParser().parseFromString(kmlText, "text/xml");
    const gj  = KMLtoGJ.kml(doc);
    return gj;
  },

  // Polygons 
  extractPolygons(geojson, toValue, includesFeat){
    const polygons = [];
    //Log.info(geojson);
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

  async getMesoscaleDiscussion(lat,lon){
    var ActiveURL = "https://www.spc.noaa.gov/products/md/ActiveMD.kmz"
    const ActiveKMZ = await this.fetchBinBuffer(ActiveURL);
    //Log.info("SPC-Outlook: KMZ = " + ActiveKMZ);
    const ActiveKML = this.extractKmlFromKmz(ActiveKMZ, "ActiveMD.kml");
    //Log.info("SPC-Outlook: KML = " + ActiveKML);
    const MDURLs = this.parseNetworkLinks(ActiveKML);
    //Log.info("SPC-Outlook: Total MDs #" + MDURLs)
    if(MDURLs.length == 0) return false;
    MDArray = [];
    for(const MDURL of MDURLs){
      const MDKMZ = await this.fetchBinBuffer(MDURL);
      const MDKML = this.extractKmlFromKmz(MDKMZ, this.kmzToKmlfilename(MDURL));
      const MDgj = this.kmlToGeoJson(MDKML);
      const MDApplies = this.checkInPolygon(MDgj, lat, lon);
      console.log("SPC-Outlook MD Test:" + MDgj.features[0].properties.name + " | " + MDApplies);
      if(MDApplies) MDArray.push(MDgj.features[0].properties.name);
    }
    Log.info("SPC-Outlook MDArray: " + MDArray);
    if (MDArray.length == 0) return false;
    return MDArray;
  },

  
  //Day3+ % => risk
  percToRisk(pct, isSig){
    //Log.info(`SPC-Outlook: ${pct} | ${isSig}`)
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

  async getSpcOutlook(lat, lon, extended) {
    try {
      const catComparator = {
        initial: 0,
        comparator: (best, val) => Math.max(best, val)
      };

      const percComparator = catComparator;

      const sigComparator = {
        initial: false,
        comparator: (_, val) => val === "SIGN" || Boolean(val) 
     };
      //Log.info("SPC-Outlook: I'M IN")
      //Log.info("SPC-Outlook: Day 4-8 extended - " + extended)

      // The Python script has “risk_to_value” and “value_to_risk” logic:
      const riskToValue = {
        TSTM: 1, MRGL: 2, SLGT: 3, ENH: 4, MDT: 5, HIGH: 6
      };
      
      

      const riskToColor = {
        NONE: "afddf6", TSTM: "d2ffa6", MRGL: "7ac687", SLGT: "f7f690", ENH: "e9c188", MDT: "eb7e82", HIGH: "ff81f8"
      }; // https://www.spc.noaa.gov/new/css/SPCmain.css
      // Then repeat for day2, day3, etc.

      day1CatURL = "https://www.spc.noaa.gov/products/outlook/day1otlk_cat.lyr.geojson"
      day1TorURL = "https://www.spc.noaa.gov/products/outlook/day1otlk_torn.lyr.geojson";
      day1HailURL = "https://www.spc.noaa.gov/products/outlook/day1otlk_hail.lyr.geojson";
      day1WindURL = "https://www.spc.noaa.gov/products/outlook/day1otlk_wind.lyr.geojson";

      day2CatURL = "https://www.spc.noaa.gov/products/outlook/day2otlk_cat.lyr.geojson"
      day2TorURL = "https://www.spc.noaa.gov/products/outlook/day2otlk_torn.lyr.geojson";
      day2HailURL = "https://www.spc.noaa.gov/products/outlook/day2otlk_hail.lyr.geojson";
      day2WindURL = "https://www.spc.noaa.gov/products/outlook/day2otlk_wind.lyr.geojson";

      day3CatURL = "https://www.spc.noaa.gov/products/outlook/day3otlk_cat.lyr.geojson";
      day3ProbURL = "https://www.spc.noaa.gov/products/outlook/day3otlk_prob.lyr.geojson";

      day4URL = "https://www.spc.noaa.gov/products/exper/day4-8/day4prob.lyr.geojson";
      day5URL = "https://www.spc.noaa.gov/products/exper/day4-8/day5prob.lyr.geojson";
      day6URL = "https://www.spc.noaa.gov/products/exper/day4-8/day6prob.lyr.geojson";
      day7URL = "https://www.spc.noaa.gov/products/exper/day4-8/day7prob.lyr.geojson";
      day8URL = "https://www.spc.noaa.gov/products/exper/day4-8/day8prob.lyr.geojson";


      loc = turf.point([lon, lat]);

      //Day 1

      //Day 1 Cat
      geojson = await this.fetchGeoJson(day1CatURL);
      var day1RiskPoly = this.extractPolygons(geojson, label => riskToValue[label] || 0, (label, val) => val > 0);
      var day1RiskResult = this.evaluatePolygons(day1RiskPoly, loc, catComparator);
      var day1Risk = day1RiskResult === 0 ? "NONE" : valueToRisk[day1RiskResult];
      //testing Continious decay;
      // var day1RiskCont = this.evaluatePolygonsContinuous(day1RiskPoly, loc, catComparator);
      // console.log("SPC-Outlook: Test new risk Cont = " + day1RiskCont);
      // //testing Weighted Average;
      // var day1RiskWght = this.evaluatePolygonsContinuous(day1RiskPoly, loc, catComparator);
      // console.log("SPC-Outlook: Test new risk Wghtd = " + day1RiskWght);
  
      // Day 1 Torn
      geojson = await this.fetchGeoJson(day1TorURL);  
      var day1TorRiskPoly = this.extractPolygons(geojson, label => label === "" ? 0 : parseFloat(label), (label, val) => val > 0);
      var day1TorRisk = this.evaluatePolygons(day1TorRiskPoly, loc, percComparator)
      day1TorSign = false;
      //Tor SIGN, reuse GEOJSON
      if(day1TorRisk > 0){
        day1TorRiskPoly = this.extractPolygons(geojson, label => label => label, (label,val) => label === "SIGN");
        day1TorSign = this.evaluatePolygons(day1TorRiskPoly, loc, sigComparator)
      }

      // Day 1 Hail
      geojson = await this.fetchGeoJson(day1HailURL);  
      var day1HailRiskPoly = this.extractPolygons(geojson, label => label === "" ? 0 : parseFloat(label), (label, val) => val > 0);
      var day1HailRisk = this.evaluatePolygons(day1HailRiskPoly, loc, percComparator)
      day1HailSign = false;
      //Tor SIGN, reuse GEOJSON
      if(day1HailRisk > 0){
        day1HailRiskPoly = this.extractPolygons(geojson, label => label => label, (label,val) => label === "SIGN");
        day1HailSign = this.evaluatePolygons(day1HailRiskPoly, loc, sigComparator);
      }

      // Day 1 Wind
      geojson = await this.fetchGeoJson(day1WindURL);  
      var day1WindRiskPoly = this.extractPolygons(geojson, label => label === "" ? 0 : parseFloat(label), (label, val) => val > 0);
      var day1WindRisk = this.evaluatePolygons(day1WindRiskPoly, loc, percComparator)
      day1WindSign = false;
      //Tor SIGN, reuse GEOJSON
      if(day1WindRisk > 0){
        day1WindRiskPoly = this.extractPolygons(geojson, label => label => label, (label,val) => label === "SIGN");
        day1WindSign = this.evaluatePolygons(day1WindRiskPoly, loc, sigComparator);
      }

      // If Day 1 Risk at all
      var day1ProbRisk = false; 
      if (day1TorRisk > 0 || day1HailRisk > 0 || day1WindRisk > 0) day1ProbRisk = true;

      // Day 2

      //Day 2 Cat
      geojson = await this.fetchGeoJson(day2CatURL);
      var day2RiskPoly = this.extractPolygons(geojson, label => riskToValue[label] || 0, (label, val) => val > 0);
      var day2RiskResult = this.evaluatePolygons(day2RiskPoly, loc, catComparator);
      var day2Risk = day2RiskResult === 0 ? "NONE" : valueToRisk[day2RiskResult];
  
      // Day 2 Torn
      geojson = await this.fetchGeoJson(day2TorURL);  
      var day2TorRiskPoly = this.extractPolygons(geojson, label => label === "" ? 0 : parseFloat(label), (label, val) => val > 0);
      var day2TorRisk = this.evaluatePolygons(day2TorRiskPoly, loc, percComparator);
      day2TorSign = false;
      //Tor SIGN, reuse GEOJSON
      if(day2TorRisk > 0) {
        day2TorRiskPoly = this.extractPolygons(geojson, label => label => label, (label,val) => label === "SIGN");
        day2TorSign = this.evaluatePolygons(day2TorRiskPoly, loc, sigComparator);
      }

      // Day 2 Hail
      geojson = await this.fetchGeoJson(day2HailURL);  
      var day2HailRiskPoly = this.extractPolygons(geojson, label => label === "" ? 0 : parseFloat(label), (label, val) => val > 0);
      var day2HailRisk = this.evaluatePolygons(day2HailRiskPoly, loc, percComparator);
      day2HailSign = false;
      //Tor SIGN, reuse GEOJSON
      day2HailRiskPoly = this.extractPolygons(geojson, label => label => label, (label,val) => label === "SIGN");
     if(day2HailRisk > 0){
        day2HailRiskPoly = this.extractPolygons(geojson, label => label => label, (label,val) => label === "SIGN");
        day2HailSign = this.evaluatePolygons(day2HailRiskPoly, loc, sigComparator);
      } 
      // Day 2 Wind
      geojson = await this.fetchGeoJson(day2WindURL);  
      var day2WindRiskPoly = this.extractPolygons(geojson, label => label === "" ? 0 : parseFloat(label), (label, val) => val > 0);
      var day2WindRisk = this.evaluatePolygons(day2WindRiskPoly, loc, percComparator)
      day2WindSign = false;
      //Tor SIGN, reuse GEOJSON
      if(day2WindRisk > 0){
        day2WindRiskPoly = this.extractPolygons(geojson, label => label => label, (label,val) => label === "SIGN");
        day2WindSign = this.evaluatePolygons(day2WindRiskPoly, loc, sigComparator);
      } 

      // If Day 2 Risk at all
      var day2ProbRisk = false; 
      if (day2TorRisk > 0 || day2HailRisk > 0 || day2WindRisk > 0) day2ProbRisk = true;

      //DAY 3
      //Day 3 Cat

      geojson = await this.fetchGeoJson(day3CatURL);
      var day3RiskPoly = this.extractPolygons(geojson, label => riskToValue[label] || 0, (label, val) => val > 0);
      var day3RiskResult = this.evaluatePolygons(day3RiskPoly, loc, catComparator);
      var day3Risk = day3RiskResult === 0 ? "NONE" : valueToRisk[day3RiskResult];
      // Day 3 Prob
      geojson = await this.fetchGeoJson(day3ProbURL);  
      var day3ProbRiskPoly = this.extractPolygons(geojson, label => label === "" ? 0 : parseFloat(label), (label, val) => val > 0);
      var day3ProbRisk = this.evaluatePolygons(day3ProbRiskPoly, loc, percComparator);
      var day3Sign = false;
      if(day3ProbRisk > 0){
        day3ProbRiskPoly = this.extractPolygons(geojson, label => label => label, (label,val) => label === "SIGN");
        day3Sign = this.evaluatePolygons(day3ProbRiskPoly, loc, sigComparator);
      }

      if (!extended)
      {
        return {
          day1: {
           "risk": day1Risk,
           "text": valueToFullRisk[day1Risk],
           "color": riskToColor[day1Risk],
           "probRisk": day1ProbRisk,
           "torRisk": day1TorRisk,
           "torSign": day1TorSign,
           "hailRisk": day1HailRisk,
           "hailSign": day1HailSign,
           "windRisk": day1WindRisk,
           "windSign": day1WindSign
          },
          day2: {
            "risk": day2Risk,
            "text": valueToFullRisk[day2Risk],
            "color": riskToColor[day2Risk],
            "probRisk": day2ProbRisk,
            "torRisk": day2TorRisk,
            "torSign": day2TorSign,
            "hailRisk": day2HailRisk,
            "hailSign": day2HailSign,
            "windRisk": day2WindRisk,
            "windSign": day2WindSign
          },
          day3: {
          "risk": day3Risk,
          "text": valueToFullRisk[day3Risk],
          "color": riskToColor[day3Risk],
          "probRisk": day3ProbRisk,
          "sign": day3Sign
          }
        };
      }

      //Day 5
      geojson = await this.fetchGeoJson(day4URL);
      var day4RiskPoly = this.extractPolygons(geojson, label => label === "" ? 0 : parseFloat(label), (label, val) => val > 0);
      var day4ProbRisk = this.evaluatePolygons(day4RiskPoly, loc, percComparator);
      day4Sign = false;
      if(day4ProbRisk > 0){
        day4ProbRiskPoly = this.extractPolygons(geojson, label => label => label, (label,val) => label === "SIGN");
        day4Sign = this.evaluatePolygons(day4ProbRiskPoly, loc, sigComparator);
      }
      var day4Risk = this.percToRisk(day4ProbRisk, day4Sign);

      //Day 5
      geojson = await this.fetchGeoJson(day5URL);
      var day5RiskPoly = this.extractPolygons(geojson, label => label === "" ? 0 : parseFloat(label), (label, val) => val > 0);
      var day5ProbRisk = this.evaluatePolygons(day5RiskPoly, loc, percComparator);
      day5Sign = false;
      if(day5ProbRisk > 0){
        day5ProbRiskPoly = this.extractPolygons(geojson, label => label => label, (label,val) => label === "SIGN");
        day5Sign = this.evaluatePolygons(day5ProbRiskPoly, loc, sigComparator);
      }
      var day5Risk = this.percToRisk(day5ProbRisk, day5Sign);

      //Day 6
      geojson = await this.fetchGeoJson(day6URL);
      var day6RiskPoly = this.extractPolygons(geojson, label => label === "" ? 0 : parseFloat(label), (label, val) => val > 0);
      var day6ProbRisk = this.evaluatePolygons(day6RiskPoly, loc, percComparator);
      day6Sign = false;
      if(day6ProbRisk > 0){
        day6ProbRiskPoly = this.extractPolygons(geojson, label => label => label, (label,val) => label === "SIGN");
        day6Sign = this.evaluatePolygons(day6ProbRiskPoly, loc, sigComparator);
      }
      var day6Risk = this.percToRisk(day6ProbRisk, day6Sign);

      //Day 7
      geojson = await this.fetchGeoJson(day7URL);
      var day7RiskPoly = this.extractPolygons(geojson, label => label === "" ? 0 : parseFloat(label), (label, val) => val > 0);
      var day7ProbRisk = this.evaluatePolygons(day7RiskPoly, loc, percComparator);
      day7Sign = false;
      if(day7ProbRisk > 0){
        day7ProbRiskPoly = this.extractPolygons(geojson, label => label => label, (label,val) => label === "SIGN");
        day7Sign = this.evaluatePolygons(day7ProbRiskPoly, loc, sigComparator);
      }
      var day7Risk = this.percToRisk(day7ProbRisk, day7Sign);

      //Day 8
      geojson = await this.fetchGeoJson(day8URL);
      var day8RiskPoly = this.extractPolygons(geojson, label => label === "" ? 0 : parseFloat(label), (label, val) => val > 0);
      var day8ProbRisk = this.evaluatePolygons(day8RiskPoly, loc, percComparator);
      day8Sign = false;
      if(day8ProbRisk > 0){
        day8ProbRiskPoly = this.extractPolygons(geojson, label => label => label, (label,val) => label === "SIGN");
        day8Sign = this.evaluatePolygons(day8ProbRiskPoly, loc, sigComparator);
      }
      var day8Risk = this.percToRisk(day8ProbRisk, day8Sign);

      day48Risk = false;
      if(day4ProbRisk > 0 || day4ProbRisk > 0 || day4ProbRisk > 0 || day4ProbRisk > 0 || day4ProbRisk > 0) day4ProbRisk = true;

      return {
        "day48Risk": day48Risk,
          day1: {
           "risk": day1Risk,
           "text": valueToFullRisk[day1Risk],
           "color": riskToColor[day1Risk],
           "probRisk": day1ProbRisk,
           "torRisk": day1TorRisk,
           "torSign": day1TorSign,
           "hailRisk": day1HailRisk,
           "hailSign": day1HailSign,
           "windRisk": day1WindRisk,
           "windSign": day1WindSign
          },
          day2: {
            "risk": day2Risk,
            "text": valueToFullRisk[day2Risk],
            "color": riskToColor[day2Risk],
            "probRisk": day2ProbRisk,
            "torRisk": day2TorRisk,
            "torSign": day2TorSign,
            "hailRisk": day2HailRisk,
            "hailSign": day2HailSign,
            "windRisk": day2WindRisk,
            "windSign": day2WindSign
          },
          day3: {
          "risk": day3Risk,
          "text": valueToFullRisk[day3Risk],
          "color": riskToColor[day3Risk],
          "probRisk": day3ProbRisk,
          "sign": day3Sign
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
          "risk": day7Risk, 
          "probRisk": day7ProbRisk,
          "sign": day7Sign,
          "color": riskToColor[day7Risk],
          "text": valueToFullRisk[day8Risk],
        }
      };

    } catch (err) {
      console.error("Error fetching or parsing SPC data", err);
      return { error: err.toString() };
    }
  },

  checkInPolygon(geojson, lat, lon){
    const pt = turf.point([lon, lat]);
    for (const feature of geojson.features) {
      if (!feature.geometry) continue;

      // For polygons vs multipolygons:
      const geomType = feature.geometry.type;
      if (geomType === "Polygon") {
        const poly = turf.polygon(feature.geometry.coordinates);
        return turf.booleanPointInPolygon(pt, poly);
      }
      else if (geomType === "MultiPolygon") {
        const multiPoly = turf.multiPolygon(feature.geometry.coordinates);
        return turf.booleanPointInPolygon(pt, multiPoly);
      }
    }
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
//     //Log.info("SPC outlook Debug: result = " + highestValue + "|" + valueToRisk[highestValue])
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
//     //Log.info("SPC outlook Debug: result = " + highestValue)
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