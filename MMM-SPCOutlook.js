Module.register("MMM-SPCOutlook", {
  defaults: {
    lat: 35.22,    // e.g. Norman OK
    lon: -97.44,
    extended: false,
    updateInterval: 60
  },

  start: function() {
    // Request data once the module starts
    Log.info(`Starting module: ${this.name}`);
    console.log("SPC-Outlook: GET_SPC_DATA - " + this.config.lat + "," + this.config.lon + "," + this.config.extended);
    this.sendSocketNotification("GET_SPC_DATA", { lat: this.config.lat, lon: this.config.lon, extended: this.config.extended });
    // Set an interval to update every hour (3600000 milliseconds)
    setInterval(() => {this.sendSocketNotification("GET_SPC_DATA", { lat: this.config.lat, lon: this.config.lon, extended: this.config.extended });}, this.config.updateInterval * 60000);
  },

  socketNotificationReceived: function(notification, payload) {
    if (notification === "SPC_DATA_RESULT") {
      // Store the results in a variable for display
      console.log("SPC Outlook: SPC_DATA_RESULT Received - " + JSON.stringify(payload));
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
    dowToText = (day) => {
      const weekday = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
      if (day >= 7) day -= 7;
      return weekday[day];
    }
    const wrapper = document.createElement("div");
    if (!this.spcrisk) {
      wrapper.innerHTML = "Loading SPC Outlook...";
    } else if (this.spcrisk.error) {
      wrapper.innerHTML = "Error: " + this.spcrisk.error;
    } else if (this.spcrisk.day1.risk == "NONE" && this.spcrisk.day2.risk == "NONE" && this.spcrisk.day3.risk == "NONE" && !( this.config.extended && this.spcrisk.day48Risk )) {
      wrapper.innerHTML = "No Severe Weather Risk"
    } else {
      dow = new Date().getDay();
      wrapper.innerHTML = "";
      if(this.mds) {
        for(const MD of this.mds){
          wrapper.innerHTML += "<span style=\"color: #0059E0\">" + MD + " in effect.</span><br/>"
        }
      }
      if(this.spcrisk.day1.risk != "NONE") 
      {
        wrapper.innerHTML += dowToText(dow) + " (Day 1): <span style=\"color:#" + this.spcrisk.day1.color + "\">" + this.spcrisk.day1.text + "</span><br/>";
      if(this.spcrisk.day1.probRisk) {
        probRiskHTML = ""
        if (this.spcrisk.day1.torRisk > 0) probRiskHTML += "<i class=\"wi wi-tornado\"></i>" + (this.spcrisk.day1.torSign ? "⚠ " : " ") + 100 * this.spcrisk.day1.torRisk + "% ";
        if (this.spcrisk.day1.hailRisk > 0) probRiskHTML += "<i class=\"wi wi-meteor\"></i>" + (this.spcrisk.day1.hailSign ? "⚠ " : " ") + 100 * this.spcrisk.day1.hailRisk + "% ";
        if (this.spcrisk.day1.windRisk > 0) probRiskHTML += (this.spcrisk.day1.windSign ? "⚠" : "") + "<i class=\"wi wi-strong-wind\"></i> " + 100 * this.spcrisk.day1.windRisk + "%";
        wrapper.innerHTML += probRiskHTML+"<br/>";
      }}
      
      if(this.spcrisk.day2.risk != "NONE") 
      {
        wrapper.innerHTML +=  dowToText(dow+1) + " (Day 2): <span style=\"color:#" + this.spcrisk.day2.color + "\">" + this.spcrisk.day2.text + "</span><br/>";
      if(this.spcrisk.day2.probRisk) {
        probRiskHTML = ""
        if (this.spcrisk.day2.torRisk > 0) probRiskHTML += "<i class=\"wi wi-tornado\"></i> " + (this.spcrisk.day2.torSign ? "⚠" : "") + 100 * this.spcrisk.day2.torRisk + "% ";
        if (this.spcrisk.day2.hailRisk > 0) probRiskHTML += "<i class=\"wi wi-meteor\"></i> " + (this.spcrisk.day2.hailSign ? "⚠" : "") + 100 * this.spcrisk.day2.hailRisk + "% ";
        if (this.spcrisk.day2.windRisk > 0) probRiskHTML += "<i class=\"wi wi-strong-wind\"></i> " + (this.spcrisk.day2.windSign ? "⚠" : "") + 100 * this.spcrisk.day2.windRisk + "%";
        wrapper.innerHTML += probRiskHTML+"<br/>";
      }}
      if(this.spcrisk.day3.risk != "NONE") 
      {
      wrapper.innerHTML += dowToText(dow+2) + " (Day 3): <span style=\"color:#" + this.spcrisk.day3.color + "\">" + this.spcrisk.day3.text + (this.spcrisk.day3.sign ? " ⚠" : "") +"</span>";
      // if(this.spcrisk.day3.probRisk && this.spcrisk.day3.sign) { 
      //   wrapper.innerHTML += "<br/>⚠<i class=\"wi wi-thunderstorm\"></i> " + 100 * this.spcrisk.day3.probRisk + "%";
      // }
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
    }
    return wrapper;
  }
});
