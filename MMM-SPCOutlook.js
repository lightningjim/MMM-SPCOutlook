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

  getDom: function() {
    const wrapper = document.createElement("div");
    if (!this.spcrisk) {
      wrapper.innerHTML = "Loading SPC Outlook...";
    } else if (this.spcrisk.error) {
      wrapper.innerHTML = "Error: " + this.spcrisk.error;
    } else if (this.spcrisk.day1.risk == "NONE" && this.spcrisk.day2.risk == "NONE" && this.spcrisk.day3.risk == "NONE" && !( this.config.extended && this.spcrisk.day48Risk == 0)) {
      wrapper.innerHTML = "No Severe Weather Risk"
    } else {
      if(this.mds) {
        for(const MD of this.mds){
          wrapper.innerHTML = MD + "in effect.<br/>"
        }
      }
      if(this.spcrisk.day1.risk != "NONE") 
      {
        wrapper.innerHTML = "Day 1: <span style=\"color:#" + this.spcrisk.day1.color + "\">" + this.spcrisk.day1.text + "</span><br/>";
      if(this.spcrisk.day1.probRisk) {
        probRiskHTML = ""
        if (this.spcrisk.day1.torRisk > 0) probRiskHTML += (this.spcrisk.day1.torSign ? "⚠" : "") + "🌪️ " + 100 * this.spcrisk.day1.torRisk + "% ";
        if (this.spcrisk.day1.hailRisk > 0) probRiskHTML += (this.spcrisk.day1.hailSign ? "⚠" : "") + "⚪ " + 100 * this.spcrisk.day1.hailRisk + "% ";
        if (this.spcrisk.day1.windRisk > 0) probRiskHTML += (this.spcrisk.day1.windSign ? "⚠" : "") + "🌬️ " + 100 * this.spcrisk.day1.windRisk + "%";
        wrapper.innerHTML += probRiskHTML+"<br/>";
      }}
      
      if(this.spcrisk.day2.risk != "NONE") 
      {
        wrapper.innerHTML += "Day 2: <span style=\"color:#" + this.spcrisk.day2.color + "\">" + this.spcrisk.day2.text + "</span><br/>";
      if(this.spcrisk.day2.probRisk) {
        probRiskHTML = ""
        if (this.spcrisk.day2.torRisk > 0) probRiskHTML += (this.spcrisk.day2.torSign ? "⚠" : "") + "🌪️ " + 100 * this.spcrisk.day2.torRisk + "% ";
        if (this.spcrisk.day2.hailRisk > 0) probRiskHTML += (this.spcrisk.day2.hailSign ? "⚠" : "") + "⚪ " + 100 * this.spcrisk.day2.hailRisk + "% ";
        if (this.spcrisk.day2.windRisk > 0) probRiskHTML += (this.spcrisk.day2.windSign ? "⚠" : "") + "🌬️ " + 100 * this.spcrisk.day2.windRisk + "%";
        wrapper.innerHTML += probRiskHTML+"<br/>";
      }}
      if(this.spcrisk.day3.risk != "NONE") 
      {
      wrapper.innerHTML += "Day 3: <span style=\"color:#" + this.spcrisk.day3.color + "\">" + this.spcrisk.day3.text + "</span><br/>";
      if(this.spcrisk.day3.probRisk) {
        wrapper.innerHTML += (this.spcrisk.day3.sign ? "⚠" : "") + "🌪️⚪🌬️" + 100 * this.spcrisk.day3.probRisk + "%";
      }}
      if(this.config.extended)
      {
        if(this.spcrisk.day4.risk) wrapper.innerHTML += "Day 4: " + (this.spcrisk.day4.sign ? "⚠" : "") + 100 * this.spcrisk.day4.risk + "%<br/>";
        if(this.spcrisk.day5.risk) wrapper.innerHTML += "Day 5: " + (this.spcrisk.day5.sign ? "⚠" : "") + 100 * this.spcrisk.day5.risk + "%<br/>";
        if(this.spcrisk.day6.risk) wrapper.innerHTML += "Day 6: " + (this.spcrisk.day6.sign ? "⚠" : "") + 100 * this.spcrisk.day6.risk + "%<br/>";
        if(this.spcrisk.day7.risk) wrapper.innerHTML += "Day 7: " + (this.spcrisk.day7.sign ? "⚠" : "") + 100 * this.spcrisk.day7.risk + "%<br/>";
        if(this.spcrisk.day8.risk) wrapper.innerHTML += "Day 8: " + (this.spcrisk.day8.sign ? "⚠" : "") + 100 * this.spcrisk.day8.risk + "%<br/>";
      }
    }
    return wrapper;
  }
});
