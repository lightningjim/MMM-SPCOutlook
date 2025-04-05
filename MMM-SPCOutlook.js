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
  },

  socketNotificationReceived: function(notification, payload) {
    if (notification === "SPC_DATA_RESULT") {
      // Store the results in a variable for display
      console.log("SPC Outlook: SPC_DATA_RESULT Received - " + payload)
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
    } else {
      // e.g. day1 risk is in spcrisk.day1
      wrapper.innerHTML = "Day 1: <span style=\"color:#" + this.spcrisk.day1.color + "\">" + this.spcrisk.day1.text + "</span><br/>";
      //wrapper.innerHTML += "Day 2: <span style=\"color:#" + this.spcrisk.day2.color + "\">" + this.spcrisk.day2.text + "</span><br/>";
      // You can expand to show day2, day3, etc.
    }
    return wrapper;
  }
});
