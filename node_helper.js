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
      const { lat, lon } = payload;
      const result = await this.getSpcOutlook(lat, lon);
      // Send the results back to your front-end module
      console.log("SPC Outlook: " + result.day1);
      this.sendSocketNotification("SPC_DATA_RESULT", result);
    }
  },

  async getSpcOutlook(lat, lon) {
    try {
      console.log("SPC-Outlook: I'M IN")

      // The Python script has “risk_to_value” and “value_to_risk” logic:
      const riskToValue = {
        NOFC: -1, NONE: 0:, TSTM: 1, MRGL: 2, SLGT: 3, ENH: 4, MDT: 5, HIGH: 6
      };
      const valueToRisk = {
        -1: "NOFC", 0: "NONE", 1: "TSTM", 2: "MRGL", 3: "SLGT", 4: "ENH", 5: "MDT", 6: "HIGH"
      };
      const valueToFullRisk = {
        -1: "None Forecasted", 0: "None", 1: "General Thunderstorms", 2: "Marginal", 3: "Slight", 4: "Enhanced", 5: "Moderate", 6: "High"
      };

      const riskToColor = {
      	NOFC: "afddf6", NONE: "afddf6", TSTM: "d2ffa6", MRGL: "7ac687", SLGT: "f7f690", ENH: "e9c188", MDT: "eb7e82", HIGH: "ff81f8"
      }; // https://www.spc.noaa.gov/new/css/SPCmain.css

      const day1Risk = this.checkDayCat(geojson, lat, lon, riskToValue, valueToRisk);
      // Then repeat for day2, day3, etc.

      const url1 = "https://www.spc.noaa.gov/products/outlook/day1otlk_cat.lyr.geojson";
      const response1 = await fetch(url1);
      const geojson1 = await response1.json();
      const day1Risk = this.checkDayCat(geojson, lat, lon, riskToValue, valueToRisk);
      console.log("SPC-Outlook: Day 1 Risk got - " + this.day1Risk);

      const url2 = "https://www.spc.noaa.gov/products/outlook/day2otlk_cat.lyr.geojson";
      const response = await fetch(url2);
      const geojson = await response2.json();
      const day2Risk = this.checkDayCat(geojson, lat, lon, riskToValue, valueToRisk);
      console.log("SPC-Outlook: Day 2 Risk got - " + this.day2Risk);

      return {
        day1: {"risk": day1Risk, "text": valueToFullRisk[day1Risk], "color": riskToColor[day1Risk]}
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

    return highestValue === 0 ? "NONE" : valueToRisk[highestValue];
  }
});
