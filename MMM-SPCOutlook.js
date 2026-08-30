 Module.register("MMM-SPCOutlook", {
  defaults: {
    lat: 35.22,    // e.g. Norman OK
    lon: -97.44,
    extended: false,
    updateInterval: 60,
    proximityWeighting: false,
    showExcessiveRain: false,   // WPC Excessive Rainfall Outlook toggle; every new product flag defaults to false
    showWinterImpact: false,    // WPC WSSI Overall Impact toggle; every new product flag defaults to false
    showMPD: false,             // WPC Mesoscale Precipitation Discussion toggle; every new product flag defaults to false
    showHazardsOutlook: false,  // WPC Day 3-7 / CPC Day 8-14 US Hazards Outlook toggle; every new product flag defaults to false
    showDrought: false,         // D-10: sub-toggle WITHIN hazardsOutlook - shows Severe Drought / Rapid Onset Drought Risk labels. Not a product flag: it gates labels inside an already-fetched product rather than gating a fetch, so it has no registry configFlag and travels via node_helper's SUB_TOGGLES list.
    // Deviation from CFG-01 ("every new product flag defaults to false"): SPC Mesoscale
    // Discussions are a shipping, always-on feature being migrated into the registry under
    // D-02, not a new product. Defaulting this false would silently delete a live
    // capability for every existing user on upgrade.
    showSPCMD: true
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
      products: {
        showExcessiveRain: this.config.showExcessiveRain,
        showWinterImpact: this.config.showWinterImpact,
        showMPD: this.config.showMPD,
        showSPCMD: this.config.showSPCMD,
        showHazardsOutlook: this.config.showHazardsOutlook,
        showDrought: this.config.showDrought
      }
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
      // CR-03: payload[1] is the helper's monotonic poll sequence. Accepting every result
      // unconditionally meant last-writer-wins across time, so a slow chain that read SLGT
      // several minutes ago could land after a fast chain that read MDT and silently
      // downgrade an active risk — with no ⚠ badge, because every fetch in the late chain
      // succeeded, just earlier. A payload with no sequence (an older helper) is still
      // accepted, so the check can only ever reject a provably older result.
      // Phase 15 (D-03): this index moved from 2 to 1 when the separate `md` socket
      // element was retired — advisories now live inside payload[0].advisories. The two
      // ends of this contract (this read and node_helper.js's sendSocketNotification)
      // must always change together: this guard fails open (accepts everything) when it
      // reads a non-number, so a mismatch between the two ends is silent, never a crash.
      //
      // payload[2] is the helper's metadata object, and `epoch` in it is the generation
      // payload[1] belongs to. A node_helper restart resets the helper's counter to 0
      // while socket.io reconnects the browser WITHOUT reloading the page (the normal
      // behaviour for serveronly/remote-browser deployments and for any pm2/systemd
      // restart of the server), so every payload from the restarted helper was <=
      // _lastSeq and was discarded forever — the display froze on an arbitrarily old
      // payload, presented as current, with no ⚠ badge and no self-heal on any later
      // tick. That is the same "last-writer-wins across time" false negative the guard
      // exists to prevent, inverted. A changed epoch invalidates every sequence number
      // seen so far, because they came from a counter that no longer exists; comparing
      // generations explicitly is what keeps this from becoming a guess about how large
      // a backwards jump is "really" a restart.
      const meta = payload[2] && typeof payload[2] === "object" ? payload[2] : null;
      // MagicMirror runs ONE node_helper per module type and sendSocketNotification
      // broadcasts to EVERY frontend instance of that type, while the sequence guard below
      // is entirely location-agnostic. An instance configured for Norman OK therefore
      // accepted and rendered the outlook computed for an instance configured for Boston
      // MA — a viewer watching the wrong city's tornado risk with nothing on screen saying
      // so, which is the worst failure this module can produce. The helper echoes the
      // requesting instance's own coordinates back, so a payload can only be consumed by
      // the instance that asked for it. Checked before the generation/sequence bookkeeping
      // below: another instance's payload must not advance this instance's guard either.
      if (meta && meta.lat !== undefined && meta.lon !== undefined &&
          (meta.lat !== this.config.lat || meta.lon !== this.config.lon)) {
        if (!this._loggedForeignPayload) {
          this._loggedForeignPayload = true;
          Log.warn("MMM-SPCOutlook: discarding a payload addressed to " + meta.lat + "," + meta.lon +
                   " — this instance is configured for " + this.config.lat + "," + this.config.lon +
                   ". MagicMirror shares one node_helper across every instance of a module type, so " +
                   "only one location is polled; multiple instances at distinct coordinates are not supported.");
        }
        return;
      }
      const epoch = meta && typeof meta.epoch === "number" ? meta.epoch : null;
      if (epoch !== null && epoch !== this._lastEpoch) {
        if (this._lastEpoch !== undefined) {
          Log.warn("MMM-SPCOutlook: node_helper generation changed (" + this._lastEpoch +
                   " -> " + epoch + "); re-syncing the out-of-order guard");
        }
        this._lastEpoch = epoch;
        this._lastSeq = undefined;
      }
      const seq = payload[1];
      if (typeof seq === "number") {
        if (seq <= (this._lastSeq ?? -1)) {
          Log.info("SPC Outlook: discarding out-of-order SPC_DATA_RESULT (seq " + seq + " <= " + this._lastSeq + ")");
          return;
        }
        this._lastSeq = seq;
      }
      this.spcrisk = payload[0];
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
    // WR-09/CV-03: the one place the frontend names productRegistry.js's `kml-advisory`
    // rows. Each key is a row's `id` (which is also its key inside the payload's
    // `advisories` object) and each value is that row's `configFlag`. This mapping cannot be
    // derived — the frontend runs in a browser context and cannot require the registry — so
    // it is stated once here rather than spelled out at the gate and again at the render.
    // A Phase 16/17 kml-advisory row adds one line here and nothing else.
    const ADVISORY_SOURCES = { spcMD: "showSPCMD", mpd: "showMPD" };
    // WR-08/CV-03: node_helper derives every day span from PRODUCT_REGISTRY (`row.days`) and
    // states the rule outright — "no literal day count survives outside the registry" — while
    // the frontend enumerated five ERO terms and three WSSI terms by hand, in four places.
    // Raising PRODUCT_REGISTRY.excessiveRain.days from 5 to 7 therefore produced a correct
    // 28-key payload whose days 6-7 never rendered and never disqualified the no-risk
    // short-circuit, with no error at either end. The frontend runs in a browser context and
    // cannot require the registry, so the span is read off the block the backend actually
    // shipped: an `arcgis-day-layers` block carries exactly one `day{N}Risk` key per day
    // (D-05 guarantees the full block is present regardless of the toggle), which makes the
    // key count the span. Anything that is not such a block yields 0 and renders nothing.
    const dayRiskCount = (block) => {
      if (!block || typeof block !== "object") return 0;
      return Object.keys(block).filter((k) => /^day\d+Risk$/.test(k)).length;
    };
    // True when any day in an arcgis-day-layers block carries a tier other than "NONE".
    // Strict !== so a missing/undefined key is NOT counted as a risk (IN-08's trap: `!=
    // "NONE"` is true for undefined, which would render a row with `color:#undefined`).
    const blockHasRisk = (block) => {
      const days = dayRiskCount(block);
      for (let d = 1; d <= days; d++) {
        if (block[`day${d}Risk`] !== "NONE") return true;
      }
      return false;
    };
    // WR-08: hazardsOutlook day keys have no `Risk` suffix (`day3`, not `day3Risk`), so this
    // regex is disjoint from dayRiskCount's — the two never cross-match. The span is derived
    // from the block's own keys, never a literal 3..14 range, matching WR-08's rule that no
    // literal day count survives outside the registry. Tolerates a missing/non-object block
    // (returns false) and a day entry whose `hazards` is absent or not an array (skipped),
    // the same version-skew tolerance enabledAdvisories() already applies to advisories.
    // 16-REVIEW WR-04: the gate and the renderer must share ONE definition of "renderable",
    // the same remedy `enabledAdvisories()` already applies to the advisory band. They used
    // to be two predicates that drifted: the gate counted every band entry while the
    // renderer dropped entries whose window had already elapsed. A payload whose windowBand
    // held only elapsed entries therefore disqualified the no-risk short-circuit, rendered
    // nothing at all (the "Extended Hazards:" heading is written inside the loop, AFTER the
    // `continue`), fell through to the contentMarker comparison, and printed "No Severe
    // Weather Risk (unconfirmed)" on data that was neither stale nor degraded — a FALSE
    // staleness signal, and the exact trust erosion D-15's asymmetry was written to avoid.
    // It is the mirror image of the backend's CR-01.
    //
    // A negative `offsetEnd` is reachable: `_bucketHazardMatch` rejects an inverted span but
    // imposes no lower bound on the band path, so a backfill, a correction, or a multi-day
    // upstream stall can put a wholly-past window here.
    //
    // 16-REVIEW WR-01: `hazardsLabelDisplayable` is this end's half of D-09/D-10. Every
    // other product row is gated on its own config at BOTH ends; the hazards renderers
    // used to render whatever labels arrived, so correctness depended entirely on the
    // backend and frontend never disagreeing — the exact dependency WR-09's comment below
    // says must not exist. The lists are restated here rather than derived because
    // productRegistry.js is a Node module and this file runs in the browser, so it cannot
    // be required. The restatement is deliberately FAIL-SAFE in one direction: this is a
    // second filter over an already-filtered payload, so a registry label missing from
    // these lists is a no-op (the backend still drops it), and only a label listed here
    // and NOT in the registry could hide something — which is why nothing may be added to
    // these lists that is not already in productRegistry.js's
    // `hazardsExcludedLabels`/`hazardsDroughtLabels`.
    const HAZARDS_EXCLUDED_LABELS = [
      "Flooding Likely", "Flooding Occurring or Imminent", "Flooding Possible"
    ];
    const HAZARDS_DROUGHT_LABELS = ["Severe Drought", "Rapid Onset Drought Risk"];
    // WR-02: mirrors productRegistry.js's `hazardLabelKey` — normalize whitespace
    // (including U+00A0, which both `trim` and `\s` cover) and case-fold, so this gate
    // cannot be walked past by `"Flooding Likely "` or `"flooding likely"` either. Only
    // the comparison key is folded; the label rendered below is the payload's own string.
    const hazardsLabelKey = (label) =>
      (typeof label === "string" ? label.trim().replace(/\s+/g, " ").toUpperCase() : "");
    const HAZARDS_EXCLUDED_KEYS = HAZARDS_EXCLUDED_LABELS.map(hazardsLabelKey);
    const HAZARDS_DROUGHT_KEYS = HAZARDS_DROUGHT_LABELS.map(hazardsLabelKey);
    const hazardsLabelDisplayable = (label) => {
      const key = hazardsLabelKey(label);
      if (HAZARDS_EXCLUDED_KEYS.includes(key)) return false;
      // Strict `!== true`, matching the backend's D-10 gate exactly: an absent or
      // non-boolean showDrought behaves like false, per CFG-01's default.
      if (HAZARDS_DROUGHT_KEYS.includes(key) && this.config.showDrought !== true) return false;
      return true;
    };
    const renderableWindowEntries = (block) => {
      if (!block || typeof block !== "object" || !Array.isArray(block.windowBand)) return [];
      return block.windowBand.filter((entry) => (
        entry && typeof entry === "object" &&
        !(typeof entry.offsetEnd === "number" && entry.offsetEnd < 0) &&
        hazardsLabelDisplayable(entry.label)
      ));
    };
    // Companion for the day grid — same asymmetry in the smaller direction: the gate counted
    // `hazards.length` while renderHazardsDays additionally required each hazard to be a
    // non-null object and skipped the row when none survived.
    const renderableDayHazards = (day) => {
      if (!day || typeof day !== "object" || !Array.isArray(day.hazards)) return [];
      // WR-01: the same second-line-of-defense label gate the band applies, so the day
      // grid and the band cannot disagree about what this config permits either.
      return day.hazards.filter((h) => h && typeof h === "object" && hazardsLabelDisplayable(h.label));
    };
    const hazardsOutlookHasAnyDay = (block) => {
      if (!block || typeof block !== "object") return false;
      const dayKeys = Object.keys(block).filter((k) => /^day\d+$/.test(k));
      for (const key of dayKeys) {
        if (renderableDayHazards(block[key]).length > 0) return true;
      }
      return false;
    };
    // True when the block carries at least one RENDERABLE window entry. Same missing/
    // non-object tolerance as hazardsOutlookHasAnyDay.
    const hazardsOutlookHasWindowEntries = (block) => renderableWindowEntries(block).length > 0;
    // WR-09: every other product row is gated on its own toggle (`this.config.showExcessiveRain
    // && ...`, `this.config.showWinterImpact && ...`); the advisory band was not, so it
    // rendered whatever arrived. That was safe only because _runKmlAdvisoryRow returns [] when
    // the toggle is off — i.e. correctness depended entirely on the backend and frontend
    // toggles never disagreeing. They can: node_helper's `_products` is shared across
    // MagicMirror module INSTANCES of the same type (acknowledged in node_helper.js), so two
    // configured instances with different showMPD values overwrite each other's toggles on
    // every poll and the losing instance renders advisories its own config disabled.
    // WR-07: the Array.isArray filter is the tolerance the gate already applies — an absent
    // or junk key contributes nothing rather than throwing out of getDom.
    const enabledAdvisories = () => {
      const advisories = (this.spcrisk && this.spcrisk.advisories) || {};
      const lines = [];
      for (const key of Object.keys(ADVISORY_SOURCES)) {
        if (!this.config[ADVISORY_SOURCES[key]]) continue;
        if (Array.isArray(advisories[key])) lines.push(...advisories[key]);
      }
      return lines;
    };
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
      // ERO extension of the no-risk gate (Phase 19 RPT-06 regression target). WR-08: the
      // day terms are derived from the block's own keys, not enumerated. node_helper builds
      // this block from PRODUCT_REGISTRY.excessiveRain.days ("no literal day count survives
      // outside the registry") — with five terms written out here, raising that single knob
      // from 5 to 7 produced a correct 28-key payload whose days 6-7 never disqualified the
      // short-circuit and never rendered, with no error anywhere.
      !(this.config.showExcessiveRain && blockHasRisk(this.spcrisk.excessiveRain)) &&
      // WSSI extension of the no-risk gate (Phase 19 RPT-06 regression target). Without
      // this term a day with a genuine MAJOR winter impact and no convective risk would
      // short-circuit to "No Severe Weather Risk" and the winter row would never render —
      // the false-negative class this project exists to prevent. WR-08: same derivation as
      // the ERO term above, tracking PRODUCT_REGISTRY.winterImpact.days.
      !(this.config.showWinterImpact && blockHasRisk(this.spcrisk.winterImpact)) &&
      // Hazards Outlook extension of the no-risk gate (Phase 19 RPT-06 regression target). TWO
      // independent terms, not one OR'd predicate, because this product renders TWO independent
      // things: the day3-day14 grid and the window band below it. A location can sit inside a
      // window-band `Hazardous Heat` polygon with every day array empty — Temperature and Wildfire
      // features route to the band unconditionally (HAZ-02) and never populate a day. With only the
      // day term, that location renders the literal 'No Severe Weather Risk' while an active
      // multi-day heat hazard is in the payload. That is not a hypothetical: Phase 15 shipped exactly
      // this defect, where the gate's missing advisory term made every MPD invisible.
      !(this.config.showHazardsOutlook && hazardsOutlookHasAnyDay(this.spcrisk.hazardsOutlook)) &&
      !(this.config.showHazardsOutlook && hazardsOutlookHasWindowEntries(this.spcrisk.hazardsOutlook)) &&
      // Advisory extension of the no-risk gate (Phase 19 RPT-06 regression target). Before
      // Phase 15 this gate had no advisory term at all, so a location inside an active
      // discussion with no other risk rendered the literal "No Severe Weather Risk" and the
      // advisory was never displayed. That is dormant for SPC MDs, which usually accompany
      // convective risk, but fatal for MPD-01, since a WPC MPD routinely fires with zero SPC
      // convective risk. WR-09: the term now carries the same per-product toggle the ERO and
      // WSSI terms above carry, so the gate and the render agree about what is displayable —
      // an advisory the user's config disabled must not disqualify the short-circuit for a
      // band that will not render it. enabledAdvisories() tolerates a missing `advisories`
      // key, and a missing or non-array inner key, from a helper that predates this shape
      // (version skew) — the same tolerance the optional chaining here used to provide.
      !(enabledAdvisories().length > 0)
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
      // D-05: one advisory band, one colour, each entry prefixed with its issuing source
      // by `label` (SPC MD / WPC MPD entries are concatenated in that order) and MPDs
      // suffixed with their hazard type. `label` and `hazardType` both originate in remote
      // KML — the label from the Placemark <name> or the description table's MPDNumber,
      // the hazard type from the MPDType cell — so both are escaped (WR-12 already applies
      // this reasoning to MD names; MPD adds a second such source). No cap, no truncation
      // (D-07) — polygon containment already bounds the realistic count.
      // WR-07: this line used to spread `advisories.spcMD` and `advisories.mpd` directly,
      // while the gate above tolerated both a missing `advisories` key and a missing inner
      // key — `advisories || {...}` guards only the OUTER object, so a payload carrying
      // `advisories` with one key absent threw "advisories.mpd is not iterable" out of
      // getDom and took the module's ENTIRE render with it. WR-09: and it consulted no
      // toggle. Both are now settled once, in enabledAdvisories(), so the gate and the
      // render can no longer disagree about either question.
      const allAdvisories = enabledAdvisories();
      for (const entry of allAdvisories) {
        // Guard the entry itself: skip a null/non-object entry rather than rendering
        // "undefined in effect." — the failure class CR-02 already fixed once on the backend.
        if (!entry || typeof entry !== "object") continue;
        let line = escapeHtml(entry.label);
        // D-06: a hazard type is only ever a non-empty string when present — an MPD whose
        // hazard type could not be parsed renders without the suffix rather than being
        // dropped, degrading to exactly today's MD behaviour.
        if (typeof entry.hazardType === "string" && entry.hazardType.length > 0) {
          line += " — " + escapeHtml(entry.hazardType);
        }
        wrapper.innerHTML += "<span style=\"color: #0059E0\">" + line + " in effect.</span><br/>"
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
      // WR-08: one renderer for every arcgis-day-layers block, with the day span read off
      // the block the backend shipped rather than written out here. The literal `5` and `3`
      // these loops used to carry were the frontend half of a contract whose backend half
      // lives in PRODUCT_REGISTRY.<row>.days — changing the registry knob silently produced
      // days that never rendered. Nothing here names a day count or a product's key layout.
      const renderDayBlock = (label, block) => {
        const days = dayRiskCount(block);
        for (let d = 1; d <= days; d++) {
          // Strict !== so an undefined key cannot render a row with `color:#undefined`.
          if (block["day" + d + "Risk"] !== "NONE") {
            wrapper.innerHTML += label + " (Day " + d + "): <span style=\"color:#" +
              block["day" + d + "Color"] + "\">" +
              block["day" + d + "Text"] + "</span><br/>";
          }
        }
      };
      // T-16-20: the MapServer imposes no length bound on `label`, and D-11 renders
      // unmapped remote labels verbatim, so a malformed or hostile 1 MB string would
      // otherwise become a 1 MB DOM node on a Raspberry Pi. Truncation applies at the
      // render boundary only — the payload keeps the full value for Phase 18's merge.
      // Truncated BEFORE escaping so the bound counts source characters, not entity
      // expansions. 60 chars exceeds every label in the MapServer's ~15-label legend
      // (longest observed: "Much Above Normal Temperatures", 30 chars), so this can
      // only ever fire on a malformed or hostile value (T-16-22, accepted).
      const HAZARDS_LABEL_MAX_CHARS = 60;
      // Shared by both hazards renderers below (WR-06: a fix applied to one twin and
      // not the other is this codebase's recurring defect shape) — defined once, used
      // twice.
      const truncateHazardLabel = (label) => {
        const text = String(label);
        return text.length > HAZARDS_LABEL_MAX_CHARS
          ? text.slice(0, HAZARDS_LABEL_MAX_CHARS) + "…"
          : text;
      };
      // T-16-19: an unvalidated `color` reaching `style="color:#..."` is an attribute
      // injection vector, and is also the `color:#undefined` IN-08 class. Substitute a
      // safe default rather than interpolating an unvalidated value.
      const validHazardColor = (color) => (
        typeof color === "string" && /^[0-9a-fA-F]{6}$/.test(color) ? color : "aaaaaa"
      );
      // D-01: the weekday comes from the payload's resolved UTC date, never from
      // dowToText(dow + N) — WPC's "Day N" boundary differs from SPC's (Pitfall 9), so
      // offset arithmetic drifts by one; the backend already resolved the real date.
      // Returns null when the date is unparseable rather than leaking NaN/undefined.
      const hazardsWeekdayFromDate = (dateStr) => {
        const dt = new Date(String(dateStr) + "T00:00:00Z");
        return isFinite(dt.getTime()) ? dowToText(dt.getUTCDay()) : null;
      };
      // T-16-18/T-16-21: renders the day3..day14 grid. Guarded against a missing/
      // non-object block (WR-07 — a throw here takes the whole render down).
      const renderHazardsDays = (block) => {
        if (!block || typeof block !== "object") return;
        // WR-08: the day span is derived from the block's own keys, never a literal
        // 3..14 range — the registry, not this renderer, owns the day count.
        const dayKeys = Object.keys(block)
          .filter((k) => /^day\d+$/.test(k))
          .sort((a, b) => Number(a.slice(3)) - Number(b.slice(3)));
        for (const key of dayKeys) {
          const entry = block[key];
          // WR-04: the same shared-predicate treatment as the band — the gate's notion of
          // "this day has something to show" and the renderer's must be one definition.
          // ERO-03 / 15 D-09: absence is silence, applied per day — no row, no "None".
          const renderableHazards = renderableDayHazards(entry);
          if (renderableHazards.length === 0) continue;
          const d = Number(key.slice(3));
          const weekday = hazardsWeekdayFromDate(entry.date);
          const weekdaySegment = weekday ? weekday + ", " : "";
          // D-02: ordering within a row is the payload's array order, untouched — the
          // backend already applied the registry-declared order; re-sorting here would
          // put the ordering rule at two sites.
          const hazardSpans = renderableHazards
            .map((h) => (
              "<span style=\"color:#" + validHazardColor(h.color) + "\">" +
              escapeHtml(truncateHazardLabel(h.label)) + "</span>"
            ));
          wrapper.innerHTML += "Hazards (" + weekdaySegment + "Day " + d + "): " +
            hazardSpans.join(", ") + "<br/>";
        }
      };
      // D-05: this is its own labeled region, below the day rows — deliberately NOT
      // folded into the advisory band (15 D-05). That band holds things in effect NOW
      // (MDs/MPDs are 1-6h nowcasts); "in effect" wording does not apply to a 5-to-7-day
      // forecast window. Accepted cost: Phase 19 relocates two blocks rather than one.
      const renderHazardsWindowBand = (block) => {
        // ERO-03 / 15 D-09: absence is silence applies to the band as a whole — a
        // missing/non-object block or an empty/non-array windowBand renders nothing,
        // not even the heading.
        if (renderableWindowEntries(block).length === 0) {
          return;
        }
        let headingWritten = false;
        // D-07: ordering is the payload array's order, untouched — the backend already
        // applied the registry order (span start, ties broken by registry order);
        // re-sorting here would put the ordering rule at two sites.
        //
        // WR-04: iterate the SHARED predicate, not `block.windowBand` with a local copy of
        // the filter. The "a wholly-elapsed window is not a forecast, and rendering it
        // would be worse than silence" rule now lives in exactly one place
        // (renderableWindowEntries) and the no-risk gate reads the same definition, so the
        // two cannot disagree about whether this band has anything to say.
        for (const entry of renderableWindowEntries(block)) {
          if (!headingWritten) {
            wrapper.innerHTML += "Extended Hazards:<br/>";
            headingWritten = true;
          }
          // D-08/D-06: both weekday and offset carry the feature's own observed span,
          // never the layer's nominal window (D-06) — a D8-14 layer can carry a 2-day
          // feature. Omit the weekday pair rather than leak NaN when either date is
          // unparseable; the offset segment survives on its own.
          const startWeekday = hazardsWeekdayFromDate(entry.startDate);
          const endWeekday = hazardsWeekdayFromDate(entry.endDate);
          const singleDay = entry.offsetStart === entry.offsetEnd;
          let weekdaySegment = "";
          if (startWeekday && endWeekday) {
            weekdaySegment = (singleDay ? startWeekday : startWeekday + "–" + endWeekday) + " ";
          }
          // WR-06: coerce rather than trust the payload's types. These were the only
          // payload-sourced values in either hazards renderer that reached innerHTML
          // skipping BOTH escapeHtml and a type guard — while the elapsed-window guard
          // three lines above does type-check `offsetEnd`. They are structurally numbers
          // today (`Math.round` of a `Number.isFinite`-validated input), so this is not an
          // exploitable XSS; it is this file's own WR-12 rule that nothing remote-sourced
          // reaches the DOM without one of the two.
          const off = (n) => (typeof n === "number" && isFinite(n) ? String(Math.trunc(n)) : "?");
          const offsetSegment = singleDay
            ? "(D" + off(entry.offsetStart) + ")"
            : "(D" + off(entry.offsetStart) + "–" + off(entry.offsetEnd) + ")";
          const label = "<span style=\"color:#" + validHazardColor(entry.color) + "\">" +
            escapeHtml(truncateHazardLabel(entry.label)) + "</span>";
          wrapper.innerHTML += weekdaySegment + offsetSegment + ": " + label + "<br/>";
        }
      };
      if (this.config.showExcessiveRain) {
        renderDayBlock("Excessive Rain", this.spcrisk.excessiveRain);
      }
      if (this.config.showWinterImpact) {
        // D-09 AMENDED: the "!== NONE" gate alone is sufficient here — the registry's
        // includesFeat (val >= 2) already drops WINTER WEATHER AREA features before
        // evaluatePolygons ever sees them, so this payload can only ever carry "NONE"
        // for that case. Do not "fix" this by adding a separate WWA term; the floor is
        // enforced in productRegistry.js, and recording it at both ends keeps the two
        // files' coupling visible.
        renderDayBlock("Winter Impact", this.spcrisk.winterImpact);
      }
      // Gated on the same flag the no-risk gate terms use (WR-09 — gate and render must
      // agree about what is displayable). Placed before the contentMarker comparison so
      // a stale payload carrying real hazards renders its content and not a bare ⚠
      // badge (D-16, CR-01).
      if (this.config.showHazardsOutlook) {
        renderHazardsDays(this.spcrisk.hazardsOutlook);
        renderHazardsWindowBand(this.spcrisk.hazardsOutlook);
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
