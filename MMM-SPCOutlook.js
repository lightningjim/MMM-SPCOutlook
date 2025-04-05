Module.register("MMM-SPCOutlook", {
  defaults: {
    lat: 35.22,    // e.g. Norman OK
    lon: -97.44
  },

  start: function() {
    // Request data once the module starts
    Log.info(`Starting module: ${this.name}`);
    this.sendSocketNotification("GET_SPC_DATA", { lat: this.config.lat, lon: this.config.lon });
    console.log("SPC Outlook: GET_SPC_DATA - " + this.config.lat + "," + this.config.lon);
    // Set an interval to update every hour (3600000 milliseconds)
    setInterval(() => {this.sendSocketNotification("GET_SPC_DATA", { lat: this.config.lat, lon: this.config.lon });}, 3600000);
  },

  socketNotificationReceived: function(notification, payload) {
    if (notification === "SPC_DATA_RESULT") {
      // Store the results in a variable for display
      console.log("SPC Outlook: SPC_DATA_RESULT Received - " + JSON.stringify(payload));
      this.spcrisk = payload;
      this.updateDom();
    }
  },

  getDom: function() {
    const wrapper = document.createElement("div");
    if (!this.spcrisk) {
      wrapper.innerHTML = "Loading SPC Outlook...";
    } else if (this.spcrisk.error) {
      wrapper.innerHTML = "Error: " + this.spcrisk.error;
    } else if (this.spcrisk.day1.risk == "NONE" && this.spcrisk.day2.risk == "NONE" && this.spcrisk.day3.risk == "NONE") {
      wrapper.innerHTML = "No Severe Weather Risk"
    } else {
      // e.g. day1 risk is in spcrisk.day1
      wrapper.innerHTML = "Day 1: <span style=\"color:#" + this.spcrisk.day1.color + "\">" + this.spcrisk.day1.text + "</span><br/>";
      if(this.spcrisk.day1.probRisk) {
        probRiskHTML = ""
        if (this.spcrisk.day1.torRisk > 0) probRiskHTML += "🌪️ " + 100 * this.spcrisk.day1.torRisk + "% ";
        if (this.spcrisk.day1.hailRisk > 0) probRiskHTML += "⚪ " + 100 * this.spcrisk.day1.hailRisk + "% ";
        if (this.spcrisk.day1.windRisk > 0) probRiskHTML += "🌬️ " + 100 * this.spcrisk.day1.windRisk + "%";
        wrapper.innerHTML += probRiskHTML+"<br/>";
      }
      wrapper.innerHTML += "Day 2: <span style=\"color:#" + this.spcrisk.day2.color + "\">" + this.spcrisk.day2.text + "</span><br/>";
      if(this.spcrisk.day2.probRisk) {
        probRiskHTML = ""
        if (this.spcrisk.day2.torRisk > 0) probRiskHTML += "🌪️ " + 100 * this.spcrisk.day2.torRisk + "% ";
        if (this.spcrisk.day2.hailRisk > 0) probRiskHTML += "⚪ " + 100 * this.spcrisk.day2.hailRisk + "% ";
        if (this.spcrisk.day2.windRisk > 0) probRiskHTML += "🌬️ " + 100 * this.spcrisk.day2.windRisk + "%";
        wrapper.innerHTML += probRiskHTML+"<br/>";
      }
      wrapper.innerHTML += "Day 3: <span style=\"color:#" + this.spcrisk.day3.color + "\">" + this.spcrisk.day3.text + "</span><br/>";
      if(this.spcrisk.day3.probRisk) {
        wrapper.innerHTML += "🌪️⚪🌬️" + 100 * this.spcrisk.day3.probRisk + "%";
      }
    }
    return wrapper;
  }
});
