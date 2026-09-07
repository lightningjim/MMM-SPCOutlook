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
    showSPCMD: true,
    showHeatRisk: false,        // NWS/WPC HeatRisk toggle; every new product flag defaults to false
    // D-01/D-02: a DISPLAY FLOOR, not a fetch gate — the first frontend-only flag in this
    // file. Default false renders category 2 (Moderate) and above; true drops the floor to
    // 1 (Minor). NWS defines Level 1 as affecting "primarily those individuals extremely
    // sensitive to heat," which at CONUS latitudes is close to a summer-long constant — the
    // same noise problem 16 D-10's showDrought gate answered, and the same shape as WSSI's
    // WINTER WEATHER AREA floor. Unlike showDrought, which must reach the backend because it
    // gates labels inside an already-fetched product, showMinorHeat filters a payload the
    // backend has already fully emitted: it does NOT go into buildRequestPayload's products
    // object and does NOT go into node_helper.js's SUB_TOGGLES. The backend still emits
    // filtered-out days because Phase 18's MERGE-03 must distinguish "HeatRisk said Minor"
    // from "HeatRisk had no reading" — if a Level-1 day never reached the payload, MERGE-03
    // would either leak WPC's coarse binary Hazardous Heat flag through or suppress it on no
    // evidence.
    showMinorHeat: false,
    // Phase 19 (RPT-02): frontend-only display mode, the same sense as showMinorHeat above —
    // it filters/expands a payload the backend has already fully emitted (this.spcrisk.days),
    // so it goes into neither buildRequestPayload's products object nor node_helper.js's
    // SUB_TOGGLES. Default false renders the compact one-line-per-day summary; true expands
    // every day into its dimension sub-rows (D-04's per-day auto-expand independently
    // promotes a specific day to the same expanded rendering regardless of this flag).
    dayReportDetail: false
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
        showDrought: this.config.showDrought,
        showHeatRisk: this.config.showHeatRisk
      }
    };
  },

  start: function() {
    // PERF-03/D-17: the wall-clock bracket's start — module start to first accepted
    // payload. The backend-interval half of the same measurement is logged by
    // node_helper.js (D-17); MagicMirror calls updateDom() synchronously off
    // socketNotificationReceived, which is why first-accepted-payload is the practical
    // proxy for first populated render.
    this._startedAtMs = Date.now();
    this._loggedFirstPayloadMs = false;
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
      // PERF-03/D-17: the wall-clock bracket's other end, fired only for a payload that
      // passed every guard above (foreign-instance, epoch, out-of-order sequence) and was
      // actually accepted and stored — a rejected payload is not a populated render, and
      // measuring one would report a figure the user never saw. Logged once per module
      // start; the backend-interval half of the same measurement is logged by
      // node_helper.js (D-17).
      if (!this._loggedFirstPayloadMs) {
        this._loggedFirstPayloadMs = true;
        Log.info("MMM-SPCOutlook: first accepted payload " + (Date.now() - this._startedAtMs) +
                 "ms after module start (wall clock; module-start -> first accepted " +
                 "SPC_DATA_RESULT -> updateDom(), the practical proxy for first populated " +
                 "render; see node_helper.js for this measurement's backend-interval half)");
      }
      this.updateDom();
    }
  },

  getStyles: function() {
    return [
      this.file("node_modules/weather-icons/css/weather-icons.min.css")
    ];
  },

  getDom: function() {
    // D-01: the weekday comes from the payload's resolved UTC date, never from
    // dowToText(dow + N) — WPC's "Day N" boundary differs from SPC's (Pitfall 9), so
    // offset arithmetic drifts by one; used only via hazardsWeekdayFromDate below.
    const dowToText = (day) => {
      const weekday = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
      if (day >= 7) day -= 7;
      return weekday[day];
    }
    const PROX_MIN_WEIGHT = 0.1;
    // Re-introduced for plan 19-05's detail-mode probabilistic sub-line and day-3 badge
    // (retired as dead code by plan 19-04 when its only call sites, the legacy day1-3
    // sections, were removed — it has a real call site again now). Numeric input, trailing
    // space (distinct from cigLabelFromTierString's string-tier/no-trailing-space form
    // below — their input domains never overlap, so they stay two functions, never merged).
    // Non-numeric/out-of-range input returns "" rather than a glyph, satisfying the "no
    // segment rather than undefined%/NaN%" guard for every call site.
    const cigLabel = (cig) => {
      if (cig === 3) return "③ ";
      if (cig === 2) return "② ";
      if (cig === 1) return "① ";
      return "";
    };
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
    // T-16-19: an unvalidated `color` reaching `style="color:#..."` is an attribute
    // injection vector, and is also the `color:#undefined` IN-08 class. Substitute a
    // safe default rather than interpolating an unvalidated value. Relocated (Phase 19
    // RPT-06/WR-06) above every render branch so both the day loop and the band apply it.
    const validHazardColor = (color) => (
      typeof color === "string" && /^[0-9a-fA-F]{6}$/.test(color) ? color : "aaaaaa"
    );
    // T-16-20: the MapServer imposes no length bound on a remote label, and 18 D-07 renders
    // unmapped remote labels verbatim, so a malformed or hostile 1 MB string would
    // otherwise become a 1 MB DOM node on a Raspberry Pi. Truncation applies at the
    // render boundary only — the payload keeps the full value for the backend's merge.
    // Truncated BEFORE escaping so the bound counts source characters, not entity
    // expansions (T-16-22). Relocated (Phase 19 RPT-06/WR-06) above every render branch,
    // one shared helper for the one call-site class the unified day loop now uses.
    const HAZARDS_LABEL_MAX_CHARS = 60;
    const truncateHazardLabel = (label) => {
      const text = String(label);
      return text.length > HAZARDS_LABEL_MAX_CHARS
        ? text.slice(0, HAZARDS_LABEL_MAX_CHARS) + "…"
        : text;
    };
    // D-01: the weekday comes from the payload's resolved UTC date, never from
    // dowToText(dow + N) — WPC's "Day N" boundary differs from SPC's (Pitfall 9), so
    // offset arithmetic drifts by one; the backend already resolved the real date.
    // Returns null when the date is unparseable rather than leaking NaN/undefined.
    // Relocated (Phase 19 RPT-06) above every render branch, in scope for the unified
    // day loop.
    const hazardsWeekdayFromDate = (dateStr) => {
      const dt = new Date(String(dateStr) + "T00:00:00Z");
      return isFinite(dt.getTime()) ? dowToText(dt.getUTCDay()) : null;
    };
    // WR-09/CV-03: the one place the frontend names productRegistry.js's `kml-advisory`
    // rows. Each key is a row's `id` (which is also its key inside the payload's
    // `advisories` object) and each value is that row's `configFlag`. This mapping cannot be
    // derived — the frontend runs in a browser context and cannot require the registry — so
    // it is stated once here rather than spelled out at the gate and again at the render.
    // A Phase 16/17 kml-advisory row adds one line here and nothing else.
    const ADVISORY_SOURCES = { spcMD: "showSPCMD", mpd: "showMPD" };
    // Phase 19 (RPT-02): hazardTaxonomy.js's eight dimensions, stated rather than derived —
    // the frontend runs in a browser context and cannot require the backend's taxonomy
    // module. Widest value is 12 characters ("Flash Flood"/"Heavy Precip"), which is what
    // the detail-mode 13-character dimension field (plan 19-05) is sized against.
    const DIMENSION_LABELS = {
      "convective": "Convective", "flash-flood": "Flash Flood", "winter": "Winter",
      "heat": "Heat", "cold": "Cold", "wind": "Wind", "fire": "Fire",
      "heavy-precip": "Heavy Precip"
    };
    // Phase 19 (RPT-02): the six DAY_SOURCE_IDS, stated rather than derived, same rationale
    // as DIMENSION_LABELS above. The payload's own sources[id].displayName carries the long
    // form (e.g. "SPC Convective Outlook") — these short names are the approved
    // attribution contract for detail-mode source attribution (plan 19-05), not the long
    // displayName.
    const SOURCE_SHORT_NAMES = {
      "spc-convective": "SPC", "spc-fire": "SPC Fire", "wpc-ero": "WPC ERO",
      "wpc-wssi": "WSSI", "wpc-hazards": "WPC Hazards", "heatrisk": "HeatRisk"
    };
    // Phase 19 (RPT-03/UI-SPEC "Detail line" column contract): derived from
    // DIMENSION_LABELS' own longest value plus one, never a bare 13 literal — a future
    // taxonomy addition widens this field automatically instead of silently breaking the
    // column grid.
    const DIMENSION_FIELD_WIDTH = Math.max(
      ...Object.values(DIMENSION_LABELS).map((label) => label.length)
    ) + 1;
    // UI-SPEC "Label field width, derived exactly from the CONTEXT.md mockup": the em dash
    // of every source-attribution string lands at the same column regardless of row content
    // length. This is the exact number the spec locks; do not round or approximate it.
    const DETAIL_LABEL_FIELD_WIDTH = 23;
    // UI-SPEC "source attribution" — uncolored (structural, not hazard data), three literal
    // spaces then an em dash then one space then the source's short name. A source id with
    // no SOURCE_SHORT_NAMES entry falls back to its own (escaped) id rather than rendering
    // "undefined".
    const detailSourceAttribution = (source) => (
      "   — " + (SOURCE_SHORT_NAMES[source] || escapeHtml(String(source)))
    );
    // UI-SPEC "Detail-Mode Column Alignment": the one font-family override this phase
    // introduces, applied per sub-row's own inline style (this render mechanism has no
    // enclosing per-day element to hold it once). Carries white-space:pre-wrap alongside it
    // so the padded content above doesn't collapse to a single space (RPT-06 "Space padding
    // survives to the screen").
    const detailColoredSpan = (color, content) => (
      "<span style=\"color:#" + validHazardColor(color) +
      ";white-space:pre-wrap;font-family:'DejaVu Sans Mono','Liberation Mono',monospace\">" +
      escapeHtml(truncateHazardLabel(content)) + "</span>"
    );
    // Phase 19 (RPT-03/D-07/PROXUI): the convective sub-row's own inside-mode proximity
    // badge, three-shape probabilistic sub-line, and day-3 dual badge — the one dimension
    // that carries an optional `detail` sub-object (node_helper.js:3159-3167). Every mode
    // decision below is its own explicit expression against this day's own data, matching
    // RESEARCH.md Pitfall 4's warning not to centralize them into one shared "is this hazard
    // active" test. Returns `{ labelSuffix, subLineHtml }`: `labelSuffix` is appended INSIDE
    // the label field's own color span (before its 23-char padding, per UI-SPEC's "shares
    // the same span" rule); `subLineHtml` is emitted as a standalone line beneath the row.
    const convectiveDetailAugment = (day, winner) => {
      const detail = winner.detail;
      if (!detail || typeof detail !== "object") return { labelSuffix: "", subLineHtml: "" };
      const prox = (day && day.proximity && typeof day.proximity === "object") ? day.proximity : {};
      // Checklist rows 1/5/9 (Day 1/2/3 categorical): legacy `dayN.risk == "NONE" ?
      // "outside" : "inside"`. This dimension group only exists when the day HAS a
      // surviving convective entry (a NONE/TSTM day never reaches this code — the backend's
      // own floor already excluded it before it ever became a hazards entry), so
      // `winner.label` (which carries the original risk token) is tested directly against
      // "NONE" rather than assuming the mode — a future architecture change that ever did
      // admit a NONE-risk entry here cannot silently flip this to a hardcoded "inside".
      const categoricalMode = winner.label === "NONE" ? "outside" : "inside";
      const categoricalBadge = proximityBadge(prox.categorical, categoricalMode);
      const hasTorFamily = Object.prototype.hasOwnProperty.call(detail, "torRisk") ||
        Object.prototype.hasOwnProperty.call(detail, "hailRisk") ||
        Object.prototype.hasOwnProperty.call(detail, "windRisk");
      const hasCigOnly = !hasTorFamily && Object.prototype.hasOwnProperty.call(detail, "cig");
      if (hasTorFamily) {
        // Grid days 1-2: the inside-mode categorical badge is part of the label field's own
        // content (UI-SPEC "Inside-mode proximity badge") — appended with no added literal
        // space, since proximityBadge()'s own return already carries a leading space.
        let subLineHtml = "";
        // Gate the whole sub-line on probRisk, matching the legacy gate exactly.
        if (detail.probRisk) {
          const segments = [];
          // Checklist rows 2/6 (Day 1/2 torCig): legacy `dayN.torCig === 0 ? "outside" :
          // "inside"`. Guarded numeric read: a non-numeric/absent torRisk or a torRisk <= 0
          // contributes no segment at all, never "undefined%"/"NaN%".
          if (typeof detail.torRisk === "number" && isFinite(detail.torRisk) && detail.torRisk > 0) {
            const torMode = detail.torCig === 0 ? "outside" : "inside";
            segments.push(
              "<i class=\"wi wi-tornado\"></i>" + cigLabel(detail.torCig) +
              // T-19-18: the plain-tier branch of proximityBadge() passes a remote-derived
              // tier token through verbatim; escaped here since this sub-line bypasses
              // detailColoredSpan's own escapeHtml call (unlike the label field's badges).
              escapeHtml(proximityBadge(prox.torCig, torMode)) + (100 * detail.torRisk) + "% "
            );
          }
          // Checklist rows 3/7 (Day 1/2 hailCig): legacy `dayN.hailCig === 0 ? "outside" :
          // "inside"`.
          if (typeof detail.hailRisk === "number" && isFinite(detail.hailRisk) && detail.hailRisk > 0) {
            const hailMode = detail.hailCig === 0 ? "outside" : "inside";
            segments.push(
              "<i class=\"wi wi-meteor\"></i>" + cigLabel(detail.hailCig) +
              escapeHtml(proximityBadge(prox.hailCig, hailMode)) + (100 * detail.hailRisk) + "% "
            );
          }
          // Checklist rows 4/8 (Day 1/2 windCig): legacy `dayN.windCig === 0 ? "outside" :
          // "inside"`.
          if (typeof detail.windRisk === "number" && isFinite(detail.windRisk) && detail.windRisk > 0) {
            const windMode = detail.windCig === 0 ? "outside" : "inside";
            segments.push(
              "<i class=\"wi wi-strong-wind\"></i>" + cigLabel(detail.windCig) +
              escapeHtml(proximityBadge(prox.windCig, windMode)) + (100 * detail.windRisk) + "% "
            );
          }
          if (segments.length > 0) {
            // 5-space indent (2 base + 3, UI-SPEC "Probabilistic sub-line"), not
            // column-aligned to the label field — a subordinate line under the whole row.
            subLineHtml = "<span style=\"white-space:pre-wrap\">     " +
              segments.join("") + "</span><br/>";
          }
        }
        return { labelSuffix: categoricalBadge, subLineHtml };
      }
      if (hasCigOnly) {
        // Grid day 3: one combined CIG glyph appended directly into the label field
        // (matching today's day-3 inline treatment), no separate breakdown line.
        // Checklist row 10 (Day 3 cig): legacy `day3.cig === 0 ? "outside" : "inside"`.
        const cigMode = detail.cig === 0 ? "outside" : "inside";
        const cigBadge = proximityBadge(prox.cig, cigMode);
        // day3DualSep: joined with ";" only when BOTH badges are non-empty strings — a
        // single non-empty badge must not acquire a stray semicolon.
        const dualSep = (categoricalBadge !== "" && cigBadge !== "") ? ";" : "";
        return { labelSuffix: cigLabel(detail.cig) + categoricalBadge + dualSep + cigBadge, subLineHtml: "" };
      }
      // Grid days 4-8 (`{probRisk, sign}`) or no detail at all (grid days 9-14, convective
      // winner is wpc-hazards there): plain label only. `sign` has never been rendered by
      // any shipped getDom() (RESEARCH Open Question 3) — rendering it would be new UI in a
      // phase whose framing is display-only, so this is a deliberate no-op (SIGN-NOOP on
      // the parity checklist), not an oversight.
      return { labelSuffix: "", subLineHtml: "" };
    };
    // Phase 19 (RPT-03/D-04-D-06): detail mode renders one sub-row per dimension present on
    // the day, in payload order (18 D-15 already fixes taxonomy order — grouped here, never
    // re-sorted), the resolved winner first with any suppressed competitors beneath it as
    // `also:` lines (D-05). A `dimension === null` entry (18 D-07 unmapped passthrough) never
    // groups with anything and never carries a competitor — node_helper.js's own resolution
    // never marks one suppressed.
    const renderDaySubRows = (day) => {
      const groups = [];
      const groupByDimension = new Map();
      for (const h of (Array.isArray(day.hazards) ? day.hazards : [])) {
        if (!h || typeof h !== "object") continue;
        let group;
        if (h.dimension === null || h.dimension === undefined) {
          group = { dimension: null, winner: null, competitors: [] };
          groups.push(group);
        } else {
          group = groupByDimension.get(h.dimension);
          if (!group) {
            group = { dimension: h.dimension, winner: null, competitors: [] };
            groupByDimension.set(h.dimension, group);
            groups.push(group);
          }
        }
        // The array already carries survivors-before-suppressed order within a dimension
        // (node_helper.js D-15), so the first suppressedBy===null entry encountered is the
        // winner; anything else on the dimension is a competitor, defensively including a
        // second suppressedBy===null entry should the resolution invariant ever be violated.
        if (h.suppressedBy === null && !group.winner) {
          group.winner = h;
        } else {
          group.competitors.push(h);
        }
      }
      for (const group of groups) {
        if (!group.winner) continue;
        const dimensionField = (group.dimension === null
          ? ""
          : (DIMENSION_LABELS[group.dimension] || group.dimension)
        ).padEnd(DIMENSION_FIELD_WIDTH);
        // D-07: the convective sub-row's inside-mode proximity badge and three-shape
        // probabilistic sub-line are relocated here, detail-only — every other dimension
        // has no `detail` sub-object at all, so this is a no-op for them.
        const augment = group.dimension === "convective"
          ? convectiveDetailAugment(day, group.winner)
          : { labelSuffix: "", subLineHtml: "" };
        const labelContent = String(group.winner.text || group.winner.label || "") + augment.labelSuffix;
        const paddedFieldContent = dimensionField + labelContent.padEnd(DETAIL_LABEL_FIELD_WIDTH);
        wrapper.innerHTML += "<span style=\"white-space:pre-wrap\">" + "  " +
          detailColoredSpan(group.winner.color, paddedFieldContent) +
          detailSourceAttribution(group.winner.source) + "</span><br/>";
        if (augment.subLineHtml) wrapper.innerHTML += augment.subLineHtml;
        for (const competitor of group.competitors) {
          // 17 literal spaces (2 + the dimension field width + 2 more), derived rather than
          // hardcoded so it stays in step with DIMENSION_FIELD_WIDTH above.
          const alsoIndent = " ".repeat(2 + DIMENSION_FIELD_WIDTH + 2);
          // The label field's remaining width once "also: " (6 chars) has already
          // consumed part of it — derived so the em dash still lands on the winner row's
          // own column regardless of DETAIL_LABEL_FIELD_WIDTH/DIMENSION_FIELD_WIDTH.
          const alsoLabelFieldWidth = DETAIL_LABEL_FIELD_WIDTH - 2 - "also: ".length;
          const competitorLabel = String(competitor.text || competitor.label || "")
            .padEnd(alsoLabelFieldWidth);
          wrapper.innerHTML += "<span style=\"white-space:pre-wrap\">" + alsoIndent + "also: " +
            detailColoredSpan(competitor.color, competitorLabel) +
            detailSourceAttribution(competitor.source) + "</span><br/>";
        }
      }
    };
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
    // D-05: this is its own labeled region, below the day rows — deliberately NOT
    // folded into the advisory band (15 D-05). That band holds things in effect NOW
    // (MDs/MPDs are 1-6h nowcasts); "in effect" wording does not apply to a 5-to-7-day
    // forecast window. Unchanged by Phase 19's day-loop rewrite — RPT-04 relocates this
    // band's position in plan 19-06, not its rendering.
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
    // Phase 19 (RPT-01/RPT-02/RPT-03/D-01–D-03): the array of a day's surviving hazard
    // entries, in payload order (18 D-15 already fixed taxonomy order; never re-sort — RPT-06
    // checklist row 25). Declared once, called from both the render-decision site and the
    // render body (WR-04's rule) so the two can never disagree about which days render.
    const daySurvivors = (day) => {
      if (!day || typeof day !== "object" || !Array.isArray(day.hazards)) return [];
      // 17 D-01/D-02, RPT-06 checklist row 30: showMinorHeat is a frontend-only DISPLAY
      // FLOOR applied to heatrisk-sourced entries specifically — 1 (minor+) when true, 2
      // (moderate+) by default. wpc-hazards' binary "Hazardous Heat" has no severity ladder
      // (FLOOR_PREBAKED) and is unaffected. A below-floor heatrisk entry already cleared the
      // backend's own presence floor (category >= 1) to reach the payload at all; this is
      // the stricter, frontend-only floor on top of that.
      const heatFloor = this.config.showMinorHeat === true ? 1 : 2;
      return day.hazards.filter((h) => {
        if (!h || typeof h !== "object" || h.suppressedBy !== null) return false;
        if (h.source === "heatrisk" && typeof h.value === "number" && h.value < heatFloor) return false;
        return true;
      });
    };
    // D-08: true when a day has no surviving hazard but proximityWeighting is on and the
    // day's outside-mode categorical proximity is renderable — the one named exception to
    // D-03's "no survivor, no row" rule, so the shipped v1.2 PROXUI outside-mode behaviour
    // is not lost at default config.
    const dayProximityOnly = (day) => (
      daySurvivors(day).length === 0 &&
      this.config.proximityWeighting === true &&
      hasRenderableProximity(day && day.proximity && day.proximity.categorical)
    );
    const wrapper = document.createElement("div");
    // Phase 19 (RPT-05/RPT-06): summary is read defensively everywhere below — an absent or
    // malformed summary can never throw out of getDom(), and can never be trusted to assert
    // a confident empty state either. A malformed summary falls through both guarded empty-
    // state branches into the main render, where a missing `days`/`advisories` renders
    // nothing and the contentMarker fallback below supplies the unconfirmed string — the
    // same CR-01 containment posture the legacy gate's own comments described.
    const summary = this.spcrisk && typeof this.spcrisk === "object" ? this.spcrisk.summary : null;
    const summaryOk = !!(summary && typeof summary === "object");
    if (!this.spcrisk) {
      wrapper.innerHTML = "Loading SPC Outlook...";
    } else if (this.spcrisk.error) {
      wrapper.textContent = "Error: " + this.spcrisk.error;
    } else if (
      // RPT-05/18 D-16: nothing was ever asked, so this is "never checked," not "checked
      // and clear" — checked first, before the anyHazard discriminator below, so a fully
      // disabled config is never confused with a genuine all-clear.
      summaryOk && typeof summary.enabledSourceCount === "number" && summary.enabledSourceCount === 0
    ) {
      wrapper.innerHTML = "No Products Enabled (edit config.js to turn one on)";
    } else if (
      // CR-01: staleness disqualifies this short-circuit entirely, preserved verbatim from
      // the legacy gate's own `!this.spcrisk._stale` term — a degraded read must still reach
      // the main branch below so the ⚠ badge renders, with "No Severe Weather Risk
      // (unconfirmed)" supplied underneath it by the contentMarker fallback (unchanged),
      // rather than a bare confident string standing in for a read that was never confirmed.
      // Only the source of "no risk" changed, from a ~15-term boolean expression to one
      // summary.anyHazard read (18's unified merge already unions every day survivor, the
      // window band and the advisories into this one flag).
      summaryOk && summary.anyHazard === false && !this.spcrisk._stale
    ) {
      wrapper.innerHTML = "No Severe Weather Risk";
    } else {
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
        // D-09: renders first, at the very top of all content, before any day block and
        // before the band — a document-level status line, not attached to any specific
        // day or the band.
        wrapper.innerHTML += "<span style=\"color:#FFCC00\">⚠ Stale" + staleSuffix + "</span><br/>";
      }
      // CR-01: everything rendered from here on is actual content. A degraded payload whose
      // summary cannot confirm an all-clear now reaches this branch (see the gate above)
      // and would otherwise render as a bare badge with nothing under it, so the marker lets
      // the tail of this branch say *what* is unconfirmed rather than leaving a dangling
      // warning. Defense in depth: the empty-state ladder above catches the normal case,
      // this catches a gate/render disagreement (Pitfall 9).
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
      // Phase 19 (RPT-01/RPT-02/RPT-03): one compact line per day, replacing every legacy
      // per-product day render section (day1-3, extended days 4-8, fire weather, the shared
      // ERO/WSSI per-day renderer, the HeatRisk loop, and the HazardsOutlook day3-14 grid).
      // Bound on the payload's own 14 always-present keys (18 D-02/WR-08), never a literal
      // day count. A missing/malformed `days` object or an individual day skips rather than
      // throwing (T-19-16).
      if (this.spcrisk.days && typeof this.spcrisk.days === "object") {
        // UI-SPEC "Vertical rhythm in detail mode": once ANY day in this render is in
        // detail mode — either the global `dayReportDetail` flag or an individual day's
        // `autoExpand` (19-03) — every day gets the same trailing blank line, so the rhythm
        // itself never discloses which specific day auto-expanded (D-04's "No Chrome for
        // Auto-Expand"). A render where nothing ever expands keeps today's dense
        // one-`<br/>`-per-day rhythm (Layout Grammar "no blank line between compact rows").
        let detailModeActive = this.config.dayReportDetail === true;
        if (!detailModeActive) {
          for (let n = 1; n <= 14 && !detailModeActive; n++) {
            const d = this.spcrisk.days[String(n)];
            if (d && d.autoExpand === true) detailModeActive = true;
          }
        }
        for (let n = 1; n <= 14; n++) {
          const day = this.spcrisk.days[String(n)];
          if (!day || typeof day !== "object") continue;
          const survivors = daySurvivors(day);
          const proximityOnly = dayProximityOnly(day);
          // D-03: no survivor and no D-08 exception — this day renders no row and no
          // marker at all, so the rendered day list is intentionally non-contiguous.
          if (survivors.length === 0 && !proximityOnly) continue;
          const weekday = hazardsWeekdayFromDate(day.date);
          const prefix = "Day " + n + (weekday ? " (" + weekday + ")" : "");
          if (proximityOnly) {
            // D-08: one literal space, then proximityBadge()'s own leading-space return —
            // together the same two-space gap every other compact line uses. Uncolored,
            // no dimension prefix — this is the one named exception to <Dimension> <Label>.
            // Wrapped in a white-space:pre-wrap span so that two-space gap (one literal
            // space plus the badge's own embedded leading space) survives to the screen
            // instead of collapsing to one (RPT-06 "Space padding survives to the screen").
            wrapper.innerHTML += "<span style=\"white-space:pre-wrap\">" + prefix + " " +
              proximityBadge(day.proximity && day.proximity.categorical, "outside") +
              "</span><br/>";
            if (detailModeActive) wrapper.innerHTML += "<br/>";
            continue;
          }
          // Compact line grammar (UI-SPEC "Layout Grammar"): prefix, exactly two literal
          // spaces, then hazard segments joined by " · " (U+00B7, outside every span).
          // This is the exact same header restated verbatim when the day expands below
          // (D-06) — never rebuilt as a second, different header string.
          const segments = survivors.map((h) => {
            const segmentText = (h.dimension !== null && h.dimension !== undefined)
              ? (DIMENSION_LABELS[h.dimension] || h.dimension) + " " + (h.text || h.label)
              : (h.text || h.label);
            return "<span style=\"color:#" + validHazardColor(h.color) + "\">" +
              escapeHtml(truncateHazardLabel(segmentText)) + "</span>";
          });
          // Wrapped in a white-space:pre-wrap span so the two literal spaces before the
          // first segment survive to the screen instead of collapsing (same reasoning as
          // the D-08 branch above).
          wrapper.innerHTML += "<span style=\"white-space:pre-wrap\">" + prefix + "  " +
            segments.join(" · ") + "</span><br/>";
          // Phase 19 (RPT-03/D-04): a day expands into dimension sub-rows when detail mode
          // is globally on OR this day cleared its own auto-expand floor (19-03) — both
          // paths call the exact same rendering, so an auto-expanded day is byte-identical
          // to a globally-expanded one (D-04's "No Chrome for Auto-Expand").
          if (this.config.dayReportDetail === true || day.autoExpand === true) {
            renderDaySubRows(day);
          }
          if (detailModeActive) wrapper.innerHTML += "<br/>";
        }
      }
      // Gated on the same flag the no-risk gate terms use (WR-09 — gate and render must
      // agree about what is displayable). Placed before the contentMarker comparison so
      // a stale payload carrying real hazards renders its content and not a bare ⚠
      // badge (D-16, CR-01). Only the window band renders here — the day3-14 grid this
      // block used to also render is now covered by the unified day loop above.
      if (this.config.showHazardsOutlook) {
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
