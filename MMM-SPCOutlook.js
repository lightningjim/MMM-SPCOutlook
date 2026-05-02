 Module.register("MMM-SPCOutlook", {
  defaults: {
    lat: 35.22,    // e.g. Norman OK
    lon: -97.44,
    extended: false,
    updateInterval: 60,
    proximityWeighting: false
  },

  start: function() {
    // Request data once the module starts
    Log.info(`Starting module: ${this.name}`);
    Log.info("SPC-Outlook: GET_SPC_DATA - " + this.config.lat + "," + this.config.lon + "," + this.config.extended);
    this.sendSocketNotification("GET_SPC_DATA", { lat: this.config.lat, lon: this.config.lon, extended: this.config.extended, updateInterval: this.config.updateInterval, proximityWeighting: this.config.proximityWeighting });
    // Set an interval to update every hour (3600000 milliseconds)
    setInterval(() => {this.sendSocketNotification("GET_SPC_DATA", { lat: this.config.lat, lon: this.config.lon, extended: this.config.extended, updateInterval: this.config.updateInterval, proximityWeighting: this.config.proximityWeighting });}, this.config.updateInterval * 60000);
  },

  socketNotificationReceived: function(notification, payload) {
    if (notification === "SPC_DATA_RESULT") {
      // Store the results in a variable for display
      Log.info("SPC Outlook: SPC_DATA_RESULT Received - " + JSON.stringify(payload));
      this.spcrisk = payload[0];
      this.mds = payload[1];
      this.updateDom();
    }
  },

  getStyles: function() {
    return [
      this.file("node_modules/weather-icons/css/weather-icons.min.css")
    ];
  },

  getDom: function() {
    const dowToText = (day) => {
      const weekday = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
      if (day >= 7) day -= 7;
      return weekday[day];
    }
    const cigLabel = (cig) => {
      if (cig === 3) return "③ ";
      if (cig === 2) return "② ";
      if (cig === 1) return "① ";
      return "";
    };
    const fireRiskToColor = { 0: "aaaaaa", 1: "FF7F00", 2: "FF0000", 3: "FF00FF" };
    const PROX_MIN_WEIGHT = 0.1;
    const cigLabelFromTierString = (tier) => {
      if (tier === "CIG3") return "③";
      if (tier === "CIG2") return "②";
      if (tier === "CIG1") return "①";
      return "";
    };
    const wrapper = document.createElement("div");
    if (!this.spcrisk) {
      wrapper.innerHTML = "Loading SPC Outlook...";
    } else if (this.spcrisk.error) {
      wrapper.innerHTML = "Error: " + this.spcrisk.error;
    } else if (
      this.spcrisk.day1.risk == "NONE" &&
      this.spcrisk.day2.risk == "NONE" &&
      this.spcrisk.day3.risk == "NONE" &&
      !( this.config.extended && this.spcrisk.day48Risk ) &&
      !(this.spcrisk.fireWeather && (this.spcrisk.fireWeather.day1Risk > 0 || this.spcrisk.fireWeather.day2Risk > 0)) &&
      !(this.config.extended && this.spcrisk.fireWeather && (
        this.spcrisk.fireWeather.day3Risk > 0 ||
        this.spcrisk.fireWeather.day4Risk > 0 ||
        this.spcrisk.fireWeather.day5Risk > 0 ||
        this.spcrisk.fireWeather.day6Risk > 0 ||
        this.spcrisk.fireWeather.day7Risk > 0 ||
        this.spcrisk.fireWeather.day8Risk > 0
      ))
    ) {
      wrapper.innerHTML = "No Severe Weather Risk"
    } else {
      const dow = new Date().getDay();
      wrapper.innerHTML = "";
      if (this.spcrisk._stale) {
        let staleSuffix = "";
        const asOf = this.spcrisk._staleAsOf;
        if (typeof asOf === "number" && isFinite(asOf)) {
          const delta = Date.now() - asOf;
          if (delta < 0) {
            staleSuffix = " — just now";
          } else {
            staleSuffix = " — " + moment(asOf).fromNow();
          }
        }
        wrapper.innerHTML += "<span style=\"color:#FFCC00\">⚠ Stale" + staleSuffix + "</span><br/>";
      }
      if(this.mds) {
        for(const MD of this.mds){
          wrapper.innerHTML += "<span style=\"color: #0059E0\">" + MD + " in effect.</span><br/>"
        }
      }
      if(this.spcrisk.day1.risk != "NONE") 
      {
        wrapper.innerHTML += dowToText(dow) + " (Day 1): <span style=\"color:#" + this.spcrisk.day1.color + "\">" + this.spcrisk.day1.text + "</span><br/>";
      if(this.spcrisk.day1.probRisk) {
        let probRiskHTML = ""
        if (this.spcrisk.day1.torRisk > 0) probRiskHTML += "<i class=\"wi wi-tornado\"></i>" + cigLabel(this.spcrisk.day1.torCig) + 100 * this.spcrisk.day1.torRisk + "% ";
        if (this.spcrisk.day1.hailRisk > 0) probRiskHTML += "<i class=\"wi wi-meteor\"></i>" + cigLabel(this.spcrisk.day1.hailCig) + 100 * this.spcrisk.day1.hailRisk + "% ";
        if (this.spcrisk.day1.windRisk > 0) probRiskHTML += "<i class=\"wi wi-strong-wind\"></i>" + cigLabel(this.spcrisk.day1.windCig) + 100 * this.spcrisk.day1.windRisk + "% ";
        wrapper.innerHTML += probRiskHTML+"<br/>";
      }}
      
      if(this.spcrisk.day2.risk != "NONE") 
      {
        wrapper.innerHTML +=  dowToText(dow+1) + " (Day 2): <span style=\"color:#" + this.spcrisk.day2.color + "\">" + this.spcrisk.day2.text + "</span><br/>";
      if(this.spcrisk.day2.probRisk) {
        let probRiskHTML = ""
        if (this.spcrisk.day2.torRisk > 0) probRiskHTML += "<i class=\"wi wi-tornado\"></i>" + cigLabel(this.spcrisk.day2.torCig) + 100 * this.spcrisk.day2.torRisk + "% ";
        if (this.spcrisk.day2.hailRisk > 0) probRiskHTML += "<i class=\"wi wi-meteor\"></i>" + cigLabel(this.spcrisk.day2.hailCig) + 100 * this.spcrisk.day2.hailRisk + "% ";
        if (this.spcrisk.day2.windRisk > 0) probRiskHTML += "<i class=\"wi wi-strong-wind\"></i>" + cigLabel(this.spcrisk.day2.windCig) + 100 * this.spcrisk.day2.windRisk + "% ";
        wrapper.innerHTML += probRiskHTML+"<br/>";
      }}
      if(this.spcrisk.day3.risk != "NONE") 
      {
      wrapper.innerHTML += dowToText(dow+2) + " (Day 3): <span style=\"color:#" + this.spcrisk.day3.color + "\">" + this.spcrisk.day3.text + cigLabel(this.spcrisk.day3.cig) + "</span>";
      wrapper.innerHTML += "<br/>";
      }
      if(this.config.extended)
      {
        if(this.spcrisk.day4.probRisk) wrapper.innerHTML += dowToText(dow+3) + " (Day 4): <span style=\"color:#" + this.spcrisk.day4.color + "\">" + this.spcrisk.day4.text + "</span><br/>";
        if(this.spcrisk.day5.probRisk) wrapper.innerHTML += dowToText(dow+4) + " (Day 5): <span style=\"color:#" + this.spcrisk.day5.color + "\">" + this.spcrisk.day5.text + "</span><br/>";
        if(this.spcrisk.day6.probRisk) wrapper.innerHTML += dowToText(dow+5) + " (Day 6): <span style=\"color:#" + this.spcrisk.day6.color + "\">" + this.spcrisk.day6.text + "</span><br/>";
        if(this.spcrisk.day7.probRisk) wrapper.innerHTML += dowToText(dow+6) + " (Day 7): <span style=\"color:#" + this.spcrisk.day7.color + "\">" + this.spcrisk.day7.text + "</span><br/>";
        if(this.spcrisk.day8.probRisk) wrapper.innerHTML += dowToText(dow+7) + " (Day 8): <span style=\"color:#" + this.spcrisk.day8.color + "\">" + this.spcrisk.day8.text + "</span><br/>";
      }
      if (this.spcrisk.fireWeather) {
        if (this.spcrisk.fireWeather.day1Risk > 0) {
          wrapper.innerHTML += "Fire Wx (Day 1): <span style=\"color:#" +
            fireRiskToColor[this.spcrisk.fireWeather.day1Risk] + "\">" +
            this.spcrisk.fireWeather.day1Text + "</span><br/>";
        }
        if (this.spcrisk.fireWeather.day2Risk > 0) {
          wrapper.innerHTML += "Fire Wx (Day 2): <span style=\"color:#" +
            fireRiskToColor[this.spcrisk.fireWeather.day2Risk] + "\">" +
            this.spcrisk.fireWeather.day2Text + "</span><br/>";
        }
        if (this.config.extended) {
          for (let d = 3; d <= 8; d++) {
            if (this.spcrisk.fireWeather["day" + d + "Risk"] > 0) {
              wrapper.innerHTML += "Fire Wx (Day " + d + "): <span style=\"color:#" +
                fireRiskToColor[this.spcrisk.fireWeather["day" + d + "Risk"]] + "\">" +
                this.spcrisk.fireWeather["day" + d + "Text"] + "</span><br/>";
            }
          }
        }
      }
    }
    return wrapper;
  }
});
