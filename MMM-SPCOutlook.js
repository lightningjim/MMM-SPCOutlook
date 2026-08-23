 Module.register("MMM-SPCOutlook", {
  defaults: {
    lat: 35.22,    // e.g. Norman OK
    lon: -97.44,
    extended: false,
    updateInterval: 60,
    proximityWeighting: false,
    showExcessiveRain: false    // WPC Excessive Rainfall Outlook toggle; every new product flag defaults to false
  },

  // WR-05: config comes from the user's MagicMirror config.js and is never validated by
  // the host. `updateInterval: 0`, a negative, or a typo like "hourly" produces 0, a
  // negative, or NaN milliseconds, all of which setInterval clamps to ~1 ms — an unbounded
  // poll loop against www.spc.noaa.gov and mapservices.weather.noaa.gov, and what turns
  // CR-03's overlapping-poll race from occasional into continuous. Resolve once, here, so
  // the timer and the value the helper is told about can never disagree.
  resolveUpdateInterval: function() {
    const n = Number(this.config.updateInterval);
    if (!Number.isFinite(n) || n < 1) {
      if (!this._loggedIntervalFallback) {
        Log.warn("MMM-SPCOutlook: invalid updateInterval " + JSON.stringify(this.config.updateInterval) +
                 ", defaulting to 60 minutes");
        this._loggedIntervalFallback = true;
      }
      return 60;
    }
    return n;
  },

  // WR-15: single source of truth for the GET_SPC_DATA payload. It was previously written
  // out twice — on startup and inside the interval — so a flag added to only one copy
  // rendered correctly at startup and silently reverted on the first refresh.
  // Per-product toggles travel as one nested `products` object rather than additional flat
  // fields; Phases 15-17 add their flags here, in this one place.
  buildRequestPayload: function() {
    return {
      lat: this.config.lat,
      lon: this.config.lon,
      extended: this.config.extended,
      updateInterval: this.resolveUpdateInterval(),
      proximityWeighting: this.config.proximityWeighting,
      products: { showExcessiveRain: this.config.showExcessiveRain }
    };
  },

  start: function() {
    // Request data once the module starts
    Log.info(`Starting module: ${this.name}`);
    Log.info("SPC-Outlook: GET_SPC_DATA - " + this.config.lat + "," + this.config.lon + "," + this.config.extended);
    this.sendSocketNotification("GET_SPC_DATA", this.buildRequestPayload());
    // Set an interval to update every updateInterval minutes (default 60).
    setInterval(() => {this.sendSocketNotification("GET_SPC_DATA", this.buildRequestPayload());}, this.resolveUpdateInterval() * 60000);
  },

  socketNotificationReceived: function(notification, payload) {
    if (notification === "SPC_DATA_RESULT") {
      // Store the results in a variable for display
      Log.info("SPC Outlook: SPC_DATA_RESULT Received - " + JSON.stringify(payload));
      // CR-03: payload[2] is the helper's monotonic poll sequence. Accepting every result
      // unconditionally meant last-writer-wins across time, so a slow chain that read SLGT
      // several minutes ago could land after a fast chain that read MDT and silently
      // downgrade an active risk — with no ⚠ badge, because every fetch in the late chain
      // succeeded, just earlier. A payload with no sequence (an older helper) is still
      // accepted, so the check can only ever reject a provably older result.
      const seq = payload[2];
      if (typeof seq === "number") {
        if (seq <= (this._lastSeq ?? -1)) {
          Log.info("SPC Outlook: discarding out-of-order SPC_DATA_RESULT (seq " + seq + " <= " + this._lastSeq + ")");
          return;
        }
        this._lastSeq = seq;
      }
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
    // Single source of truth for "is this proximity entry renderable?" — mirrors the
    // gates inside proximityBadge() so visibility predicates and the badge renderer
    // agree on what counts as above the PROX_MIN_WEIGHT noise floor. Without this,
    // a sub-noise-floor proximity makes a day row render with an empty badge,
    // leaving a bare "(Day N): None" line (bug: day2-none-still-displays).
    const hasRenderableProximity = (prox) => {
      if (!prox) return false;
      if (typeof prox.value !== "number" || !isFinite(prox.value)) return false;
      if (typeof prox.nextTier !== "string" || prox.nextTier.length === 0) return false;
      const weight = prox.value - Math.trunc(prox.value);
      if (weight < PROX_MIN_WEIGHT) return false;
      const tierLabel = prox.nextTier.startsWith("CIG")
        ? cigLabelFromTierString(prox.nextTier)
        : prox.nextTier;
      if (tierLabel === "") return false;
      return true;
    };
    // True if any categorical/cig entry on a day's proximity subtree is renderable.
    const hasAnyRenderableProximity = (proximity) => {
      if (!proximity) return false;
      return hasRenderableProximity(proximity.categorical)
        || hasRenderableProximity(proximity.cig)
        || hasRenderableProximity(proximity.torCig)
        || hasRenderableProximity(proximity.hailCig)
        || hasRenderableProximity(proximity.windCig);
    };
    const proximityBadge = (prox, mode) => {
      if (!hasRenderableProximity(prox)) return "";
      const weight = prox.value - Math.trunc(prox.value);
      const tierLabel = prox.nextTier.startsWith("CIG")
        ? cigLabelFromTierString(prox.nextTier)
        : prox.nextTier;
      if (mode === "outside") return " " + weight.toFixed(1) + " (near " + tierLabel + ")";
      return " → " + tierLabel + " " + weight.toFixed(1);
    };
    // WR-12: every string below that originates upstream is remote-controlled. The helper's
    // error text is err.toString(), and a JSON.parse SyntaxError embeds a verbatim window of
    // the response body, so an attacker-positioned `<img src=x onerror=...>` fragment would
    // otherwise reach innerHTML unescaped; MD names are unbounded remote KML text. Error
    // text goes through textContent; anything concatenated into an innerHTML string is
    // escaped first.
    const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (ch) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[ch]
    ));
    const wrapper = document.createElement("div");
    if (!this.spcrisk) {
      wrapper.innerHTML = "Loading SPC Outlook...";
    } else if (this.spcrisk.error) {
      wrapper.textContent = "Error: " + this.spcrisk.error;
    } else if (
      // CR-01: a degraded read is never an all-clear. When a fetch failure zeroes a layer
      // its value becomes "NONE" — the same value a genuine all-clear produces — so without
      // this term a total NOAA/DNS/Wi-Fi outage satisfies the whole gate below and renders
      // as a confident "No Severe Weather Risk". The ⚠ badge lives in the final else, so the
      // one branch that can show the degrade was unreachable in exactly the case the whole
      // failed/anyStale/_stale chain exists for. Staleness must disqualify the short-circuit.
      !this.spcrisk._stale &&
      this.spcrisk.day1.risk == "NONE" &&
      this.spcrisk.day2.risk == "NONE" &&
      this.spcrisk.day3.risk == "NONE" &&
      !hasAnyRenderableProximity(this.spcrisk.day1.proximity) &&
      !hasAnyRenderableProximity(this.spcrisk.day2.proximity) &&
      !hasAnyRenderableProximity(this.spcrisk.day3.proximity) &&
      !( this.config.extended && this.spcrisk.day48Risk ) &&
      !(this.spcrisk.fireWeather && (this.spcrisk.fireWeather.day1Risk > 0 || this.spcrisk.fireWeather.day2Risk > 0)) &&
      !(this.config.extended && this.spcrisk.fireWeather && (
        this.spcrisk.fireWeather.day3Risk > 0 ||
        this.spcrisk.fireWeather.day4Risk > 0 ||
        this.spcrisk.fireWeather.day5Risk > 0 ||
        this.spcrisk.fireWeather.day6Risk > 0 ||
        this.spcrisk.fireWeather.day7Risk > 0 ||
        this.spcrisk.fireWeather.day8Risk > 0
      )) &&
      // ERO extension of the no-risk gate (Phase 19 RPT-06 regression target)
      !(this.config.showExcessiveRain && this.spcrisk.excessiveRain && (
        this.spcrisk.excessiveRain.day1Risk != "NONE" ||
        this.spcrisk.excessiveRain.day2Risk != "NONE" ||
        this.spcrisk.excessiveRain.day3Risk != "NONE" ||
        this.spcrisk.excessiveRain.day4Risk != "NONE" ||
        this.spcrisk.excessiveRain.day5Risk != "NONE"
      ))
    ) {
      wrapper.innerHTML = "No Severe Weather Risk"
    } else {
      const dow = new Date().getDay();
      wrapper.innerHTML = "";
      if (this.spcrisk._stale) {
        let staleSuffix = "";
        const asOf = this.spcrisk._staleAsOf;
        // WR-04: _staleAsOf is now the oldest cached reading that contributed to the
        // payload, so this renders the real age of the data rather than the age of the
        // payload object. It is null on a hard failure with nothing cached to age, which
        // this guard handles by showing the badge with no age suffix. The former
        // `delta < 0` "just now" branch was unreachable — helper and renderer share one
        // process clock in MagicMirror, so asOf is always in the past.
        if (typeof asOf === "number" && isFinite(asOf)) {
          staleSuffix = " — " + moment(asOf).fromNow();
        }
        wrapper.innerHTML += "<span style=\"color:#FFCC00\">⚠ Stale" + staleSuffix + "</span><br/>";
      }
      // CR-01: everything rendered from here on is actual content. A degraded payload whose
      // every value is "NONE" now reaches this branch (see the gate above) and would
      // otherwise render as a bare badge with nothing under it, so the marker lets the tail
      // of this branch say *what* is unconfirmed rather than leaving a dangling warning.
      const contentMarker = wrapper.innerHTML;
      if(this.mds) {
        for(const MD of this.mds){
          wrapper.innerHTML += "<span style=\"color: #0059E0\">" + escapeHtml(MD) + " in effect.</span><br/>"
        }
      }
      if(this.spcrisk.day1.risk != "NONE" || hasRenderableProximity(this.spcrisk.day1.proximity?.categorical))
      {
        wrapper.innerHTML += dowToText(dow) + " (Day 1): <span style=\"color:#" + this.spcrisk.day1.color + "\">" + this.spcrisk.day1.text + "</span>" + proximityBadge(this.spcrisk.day1.proximity?.categorical, this.spcrisk.day1.risk == "NONE" ? "outside" : "inside") + "<br/>";
      if(this.spcrisk.day1.probRisk) {
        let probRiskHTML = ""
        if (this.spcrisk.day1.torRisk > 0) probRiskHTML += "<i class=\"wi wi-tornado\"></i>" + cigLabel(this.spcrisk.day1.torCig) + proximityBadge(this.spcrisk.day1.proximity?.torCig, this.spcrisk.day1.torCig === 0 ? "outside" : "inside") + 100 * this.spcrisk.day1.torRisk + "% ";
        if (this.spcrisk.day1.hailRisk > 0) probRiskHTML += "<i class=\"wi wi-meteor\"></i>" + cigLabel(this.spcrisk.day1.hailCig) + proximityBadge(this.spcrisk.day1.proximity?.hailCig, this.spcrisk.day1.hailCig === 0 ? "outside" : "inside") + 100 * this.spcrisk.day1.hailRisk + "% ";
        if (this.spcrisk.day1.windRisk > 0) probRiskHTML += "<i class=\"wi wi-strong-wind\"></i>" + cigLabel(this.spcrisk.day1.windCig) + proximityBadge(this.spcrisk.day1.proximity?.windCig, this.spcrisk.day1.windCig === 0 ? "outside" : "inside") + 100 * this.spcrisk.day1.windRisk + "% ";
        wrapper.innerHTML += probRiskHTML+"<br/>";
      }}

      if(this.spcrisk.day2.risk != "NONE" || hasRenderableProximity(this.spcrisk.day2.proximity?.categorical))
      {
        wrapper.innerHTML +=  dowToText(dow+1) + " (Day 2): <span style=\"color:#" + this.spcrisk.day2.color + "\">" + this.spcrisk.day2.text + "</span>" + proximityBadge(this.spcrisk.day2.proximity?.categorical, this.spcrisk.day2.risk == "NONE" ? "outside" : "inside") + "<br/>";
      if(this.spcrisk.day2.probRisk) {
        let probRiskHTML = ""
        if (this.spcrisk.day2.torRisk > 0) probRiskHTML += "<i class=\"wi wi-tornado\"></i>" + cigLabel(this.spcrisk.day2.torCig) + proximityBadge(this.spcrisk.day2.proximity?.torCig, this.spcrisk.day2.torCig === 0 ? "outside" : "inside") + 100 * this.spcrisk.day2.torRisk + "% ";
        if (this.spcrisk.day2.hailRisk > 0) probRiskHTML += "<i class=\"wi wi-meteor\"></i>" + cigLabel(this.spcrisk.day2.hailCig) + proximityBadge(this.spcrisk.day2.proximity?.hailCig, this.spcrisk.day2.hailCig === 0 ? "outside" : "inside") + 100 * this.spcrisk.day2.hailRisk + "% ";
        if (this.spcrisk.day2.windRisk > 0) probRiskHTML += "<i class=\"wi wi-strong-wind\"></i>" + cigLabel(this.spcrisk.day2.windCig) + proximityBadge(this.spcrisk.day2.proximity?.windCig, this.spcrisk.day2.windCig === 0 ? "outside" : "inside") + 100 * this.spcrisk.day2.windRisk + "% ";
        wrapper.innerHTML += probRiskHTML+"<br/>";
      }}
      if(this.spcrisk.day3.risk != "NONE" || hasRenderableProximity(this.spcrisk.day3.proximity?.categorical) || hasRenderableProximity(this.spcrisk.day3.proximity?.cig))
      {
        const day3CatBadge = proximityBadge(this.spcrisk.day3.proximity?.categorical, this.spcrisk.day3.risk == "NONE" ? "outside" : "inside");
        const day3CigBadge = proximityBadge(this.spcrisk.day3.proximity?.cig, this.spcrisk.day3.cig === 0 ? "outside" : "inside");
        const day3DualSep = (day3CatBadge !== "" && day3CigBadge !== "") ? ";" : "";
        wrapper.innerHTML += dowToText(dow+2) + " (Day 3): <span style=\"color:#" + this.spcrisk.day3.color + "\">" + this.spcrisk.day3.text + cigLabel(this.spcrisk.day3.cig) + day3CatBadge + day3DualSep + day3CigBadge + "</span>";
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
      if (this.config.showExcessiveRain && this.spcrisk.excessiveRain) {
        for (let d = 1; d <= 5; d++) {
          if (this.spcrisk.excessiveRain["day" + d + "Risk"] != "NONE") {
            wrapper.innerHTML += "Excessive Rain (Day " + d + "): <span style=\"color:#" +
              this.spcrisk.excessiveRain["day" + d + "Color"] + "\">" +
              this.spcrisk.excessiveRain["day" + d + "Text"] + "</span><br/>";
          }
        }
      }
      // CR-01: a stale payload with no renderable risk must not present as a bare ⚠ badge.
      // "unconfirmed" rather than "last known good" because the two cases are not
      // distinguishable here: the values may be a still-fresh cached reading served by
      // rejectBody's stale fallback, or the no-risk defaults left by a hard failure with
      // nothing to fall back to. Either way the one thing the display can honestly assert
      // is that this all-clear was not confirmed against upstream.
      if (wrapper.innerHTML === contentMarker) {
        wrapper.innerHTML += "No Severe Weather Risk (unconfirmed)";
      }
    }
    return wrapper;
  }
});
