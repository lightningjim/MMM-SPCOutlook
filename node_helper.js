const NodeHelper = require("node_helper");
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
const turf = require("@turf/turf"); // or another geometry library

module.exports = NodeHelper.create({
  start: function() {
    console.log("Starting node_helper for MMM-SPCOutlook...");
  },

  // Called when the front-end (MMM-SPCOutlook.js) sends a socket notification
  socketNotificationReceived: async function(notification, payload) {
    if (notification === "GET_SPC_DATA") {
      console.log("SPC Outlook: GET_SPC_DATA GET")
      const { lat, lon, extended } = payload;
      console.log("SPC-Outlook - intermediate payload" + lat + " " + lon + " " + extended)
      const result = await this.getSpcOutlook(lat, lon, extended);
      // Send the results back to your front-end module
      console.log("SPC Outlook: " + result.day1);
      this.sendSocketNotification("SPC_DATA_RESULT", result);
    }
  },

  async getSpcOutlook(lat, lon, extended) {
    try {
      //console.log("SPC-Outlook: I'M IN")
      console.log("SPC-Outlook: Day 4-8 extended - " + extended)

      // The Python script has “risk_to_value” and “value_to_risk” logic:
      const riskToValue = {
        TSTM: 1, MRGL: 2, SLGT: 3, ENH: 4, MDT: 5, HIGH: 6
      };
      const valueToRisk = {
        1: "TSTM", 2: "MRGL", 3: "SLGT", 4: "ENH", 5: "MDT", 6: "HIGH"
      };
      const valueToFullRisk = {
        NONE: "None", TSTM: "General Thunderstorms", MRGL: "Marginal", SLGT: "Slight", ENH: "Enhanced", MDT: "Moderate", HIGH: "High"
      };

      const percValueRisk = {
        0.02: 0.02, 0.05: 0.05, 0.10: 0.10, 0.15: 0.15, 0.30: 0.30
      }

      const riskToColor = {
        NONE: "afddf6", TSTM: "d2ffa6", MRGL: "7ac687", SLGT: "f7f690", ENH: "e9c188", MDT: "eb7e82", HIGH: "ff81f8"
      }; // https://www.spc.noaa.gov/new/css/SPCmain.css
      // Then repeat for day2, day3, etc.

      url = "https://www.spc.noaa.gov/products/outlook/day1otlk_cat.lyr.geojson";
      response = await fetch(url);
      geojson = await response.json();
      const day1Risk = this.checkDayCat(geojson, lat, lon, riskToValue, valueToRisk);
      //console.log("SPC-Outlook: Day 1 Risk got - " + this.day1Risk);

      day1ProbRisk = false; 
      //Torn
      url = "https://www.spc.noaa.gov/products/outlook/day1otlk_torn.lyr.geojson";
      response = await fetch(url);
      geojson = await response.json();
      const day1TorRisk = this.checkDayPerc(geojson, lat, lon);
      console.log("SPC-Outlook: Day 1 Tor Risk" + day1TorRisk)
      day1TorSign = false;
      if(day1TorRisk > 0) day1TorSign = this.checkDaySign(geojson, lat, lon);
      //Hail
      url = "https://www.spc.noaa.gov/products/outlook/day1otlk_hail.lyr.geojson";
      response = await fetch(url);
      geojson = await response.json();
      const day1HailRisk = this.checkDayPerc(geojson, lat, lon);
      day1HailSign = false;
      if(day1HailRisk > 0) day1HailSign = this.checkDaySign(geojson, lat, lon);
      console.log("SPC-Outlook: Day 1 Hail Risk" + day1HailRisk)
      //wind
      url = "https://www.spc.noaa.gov/products/outlook/day1otlk_wind.lyr.geojson";
      response = await fetch(url);
      geojson = await response.json();
      const day1WindRisk = this.checkDayPerc(geojson, lat, lon);
      day1WindSign = false;
      if(day1WindRisk > 0) day1HailSign = this.checkDaySign(geojson, lat, lon);
      console.log("SPC-Outlook: Day 1 Wind Risk" + day1WindRisk)

      if (day1TorRisk > 0 || day1HailRisk > 0 || day1WindRisk > 0) day1ProbRisk = true;
      console.log("SPC-Outlook: Day 1 Prob Risk test | " + day1ProbRisk)

      url = "https://www.spc.noaa.gov/products/outlook/day2otlk_cat.lyr.geojson";
      response = await fetch(url);
      geojson = await response.json();
      const day2Risk = this.checkDayCat(geojson, lat, lon, riskToValue, valueToRisk);
      day2ProbRisk = false; 
      //Torn
      url = "https://www.spc.noaa.gov/products/outlook/day2otlk_torn.lyr.geojson";
      response = await fetch(url);
      geojson = await response.json();
      const day2TorRisk = this.checkDayPerc(geojson, lat, lon);
      console.log("SPC-Outlook: Day 2 Tor Risk" + day2TorRisk)
      day2TorSign = false;
      if(day2TorRisk > 0) day2TorSign = this.checkDaySign(geojson, lat, lon);
      //Hail
      url = "https://www.spc.noaa.gov/products/outlook/day2otlk_hail.lyr.geojson";
      response = await fetch(url);
      geojson = await response.json();
      const day2HailRisk = this.checkDayPerc(geojson, lat, lon);
      console.log("SPC-Outlook: Day 2 Hail Risk" + day2HailRisk);
      day2HailSign = false;
      if(day2HailRisk > 0) day2HailSign = this.checkDaySign(geojson, lat, lon);
      //wind
      url = "https://www.spc.noaa.gov/products/outlook/day2otlk_wind.lyr.geojson";
      response = await fetch(url);
      geojson = await response.json();
      const day2WindRisk = this.checkDayPerc(geojson, lat, lon);
      console.log("SPC-Outlook: Day 2 Wind Risk" + day1WindRisk)
      day2WindSign = false;
      if(day2WindRisk > 0) day2HailSign = this.checkDaySign(geojson, lat, lon);

      if (day2TorRisk > 0 || day2HailRisk > 0 || day2WindRisk > 0) day2ProbRisk = true;
      console.log("SPC-Outlook: Day 2 Prob Risk test | " + day2ProbRisk)

      url = "https://www.spc.noaa.gov/products/outlook/day3otlk_cat.lyr.geojson";
      response = await fetch(url);
      geojson = await response.json();
      const day3Risk = this.checkDayCat(geojson, lat, lon, riskToValue, valueToRisk);
      console.log("SPC-Outlook: Day 2 Risk got - " + this.day2Risk);
      url = "https://www.spc.noaa.gov/products/outlook/day3otlk_prob.lyr.geojson";
      response = await fetch(url);
      geojson = await response.json();
      const day3ProbRisk = this.checkDayPerc(geojson, lat, lon);
      console.log("SPC-Outlook: Day 3 Prob Risk" + day3ProbRisk);
      day3Sign = false;
      if(day3ProbRisk > 0) day3Sign = this.checkDaySign(geojson, lat, lon);

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

      day48Risk = false;

      url = "https://www.spc.noaa.gov/products/exper/day4-8/day4prob.lyr.geojson";
      response = await fetch(url);
      geojson = await response.json();
      const day4Risk = this.checkDayPerc(geojson, lat, lon);
      day4Sign = false;
      if(day4Risk > 0) day4Sign = this.checkDaySign(geojson, lat, lon);

      url = "https://www.spc.noaa.gov/products/exper/day4-8/day5prob.lyr.geojson";
      response = await fetch(url);
      geojson = await response.json();
      const day5Risk = this.checkDayPerc(geojson, lat, lon);
      day5Sign = false;
      if(day5Risk > 0) day5Sign = this.checkDaySign(geojson, lat, lon);

      url = "https://www.spc.noaa.gov/products/exper/day4-8/day6prob.lyr.geojson";
      response = await fetch(url);
      geojson = await response.json();
      const day6Risk = this.checkDayPerc(geojson, lat, lon);
      day6Sign = false;
      if(day6Risk > 0) day6Sign = this.checkDaySign(geojson, lat, lon);

      url = "https://www.spc.noaa.gov/products/exper/day4-8/day7prob.lyr.geojson";
      response = await fetch(url);
      geojson = await response.json();
      const day7Risk = this.checkDayPerc(geojson, lat, lon);
      day7Sign = false;
      if(day7Risk > 0) day7Sign = this.checkDaySign(geojson, lat, lon);

      url = "https://www.spc.noaa.gov/products/exper/day4-8/day8prob.lyr.geojson";
      response = await fetch(url);
      geojson = await response.json();
      const day8Risk = this.checkDayPerc(geojson, lat, lon);
      day8Sign = false;
      if(day8Risk > 0) day8Sign = this.checkDaySign(geojson, lat, lon);

      if(day4Risk > 0 || day5Risk > 0 || day6Risk > 0 || day7Risk > 0 || day8Risk > 0) day48Risk = true;

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
        day4: {"risk": day4Risk, "sign": day4Sign},
        day5: {"risk": day5Risk, "sign": day5Sign},
        day6: {"risk": day6Risk, "sign": day6Sign},
        day7: {"risk": day7Risk, "sign": day7Sign},
        day8: {"risk": day8Risk, "sign": day8Sign},
      };

    } catch (err) {
      console.error("Error fetching or parsing SPC data", err);
      return { error: err.toString() };
    }
  },

  checkDayCat(geojson, lat, lon, riskToValue, valueToRisk) {
    let highestValue = 0;
    const pt = turf.point([lon, lat]);

    for (const feature of geojson.features) {
      if (!feature.geometry) continue;

      // For polygons vs multipolygons:
      const geomType = feature.geometry.type;
      const label = feature.properties.LABEL; // e.g., "SLGT", "ENH", etc.
      const labelValue = riskToValue[label] || 0;

      if (geomType === "Polygon") {
        const poly = turf.polygon(feature.geometry.coordinates);
        if (turf.booleanPointInPolygon(pt, poly) && labelValue > highestValue) {
          highestValue = labelValue;
        }
      } else if (geomType === "MultiPolygon") {
        const multiPoly = turf.multiPolygon(feature.geometry.coordinates);
        if (turf.booleanPointInPolygon(pt, multiPoly) && labelValue > highestValue) {
          highestValue = labelValue;
        }
      }
    }
    //console.log("SPC outlook Debug: result = " + highestValue + "|" + valueToRisk[highestValue])
    return highestValue === 0 ? "NONE" : valueToRisk[highestValue];
  },

  checkDayPerc(geojson, lat, lon) {
    let highestValue = 0;
    const pt = turf.point([lon, lat]);

    for (const feature of geojson.features) {
      if (!feature.geometry) continue;

      // For polygons vs multipolygons:
      const geomType = feature.geometry.type;
      const labelValue = feature.properties.LABEL;

      if (geomType === "Polygon") {
        const poly = turf.polygon(feature.geometry.coordinates);
        if (turf.booleanPointInPolygon(pt, poly) && labelValue > highestValue && labelValue != "SIGN") {
          highestValue = labelValue;
        }
      } else if (geomType === "MultiPolygon") {
        const multiPoly = turf.multiPolygon(feature.geometry.coordinates);
        if (turf.booleanPointInPolygon(pt, multiPoly) && labelValue > highestValue && labelValue != "SIGN") {
          highestValue = labelValue;
        }
      }
    }
    console.log("SPC outlook Debug: result = " + highestValue)
    return highestValue
  },

  checkDaySign(geojson, lat, lon) {
  const pt = turf.point([lon, lat]);
  for (const feature of geojson.features) {
    if (!feature.geometry) continue;
    // Only process features that are flagged as SIG
    if (feature.properties.LABEL === "SIGN") {
      let polygon;
      if (feature.geometry.type === "Polygon") {
        polygon = turf.polygon(feature.geometry.coordinates);
      } else if (feature.geometry.type === "MultiPolygon") {
        polygon = turf.multiPolygon(feature.geometry.coordinates);
      }
      if (turf.booleanPointInPolygon(pt, polygon)) {
        return true;
      }
    }
  }
  return false;
}
});