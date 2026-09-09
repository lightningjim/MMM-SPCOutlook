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
    // 19-REVIEW WR-07: the handle is RETAINED. MagicMirror keeps a hidden module's timers
    // running, so a discarded handle meant a suspended instance polled www.spc.noaa.gov and
    // mapservices.weather.noaa.gov forever with no way to stop it — `resolveUpdateInterval`
    // bounds the poll RATE but nothing bounded its LIFETIME. `_armPollTimer` is the single
    // site that creates one, so `start`, `suspend` and `resume` cannot drift apart about the
    // interval or the notification they use.
    this._armPollTimer();
  },

  // 19-REVIEW WR-07: idempotent by construction — clears any existing handle before arming,
  // so a double `resume` (or a `resume` MagicMirror delivers without an intervening
  // `suspend`) can never leave two timers polling the same endpoints.
  _armPollTimer: function() {
    this._clearPollTimer();
    this._pollTimer = setInterval(
      () => { this.sendSocketNotification("GET_SPC_DATA", this.buildRequestPayload()); },
      this.resolveUpdateInterval() * 60000
    );
  },

  _clearPollTimer: function() {
    if (this._pollTimer !== null && this._pollTimer !== undefined) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  },

  // MagicMirror calls suspend() when the module's region is hidden and resume() when it is
  // shown again. Polling a remote endpoint for a display nobody is looking at is bandwidth
  // and upstream load spent on nothing; `resume` re-arms rather than waiting out the
  // remainder of an interval, so a re-shown module renders fresh data rather than whatever
  // was last cached.
  suspend: function() {
    this._clearPollTimer();
  },

  resume: function() {
    this._armPollTimer();
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
    // 19-REVIEW WR-02: the ONE coercion of "what text does this hazard entry render as".
    // The whole point of the CR-02/03/04 fix was that a compact header and its own detail
    // sub-rows must not contradict each other; they came to share the FILTER but still
    // coerced the text two different ways — the compact line did `h.text || h.label`, which
    // renders the literal word "undefined" for an entry carrying neither (the exact failure
    // class this file names at the advisory loop's own guard and at cigLabel's "no segment
    // rather than a bad one" note), while the detail sub-row did
    // `String(... || ... || "")` and rendered a blank field. One helper, both renderers, and
    // the empty result is handled once — structurally, in hazardEntryDisplayable — rather
    // than at each render site.
    const entryText = (h) => String((h && (h.text || h.label)) || "");
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
    // 19-REVIEW CR-03: every map in this file is a plain object literal read with a key taken
    // from the PAYLOAD, and bare `map[key]` resolves `Object.prototype`'s own keys as hits.
    // That was not theoretical: `DIMENSION_LABELS["toString"]` returns a FUNCTION, which is
    // truthy, so the `||` fallback never fired and the `.padEnd` on it threw a TypeError
    // straight out of getDom() — past every day, the advisory band and the window band,
    // taking the module's ENTIRE render with it. That is the same failure class this file
    // already fixed once (see the `advisories.mpd is not iterable` note at the advisory loop)
    // and the direct opposite of the T-19-16 containment promised at the day loop.
    // `DAY_SOURCE_FLAGS["constructor"]` inverted the fail-safe the other way: `flag` became a
    // function, `this.config[flag]` was undefined, `undefined !== true`, and the entry was
    // HIDDEN — while the display blamed the user's settings for its absence — contradicting
    // the "an UNLISTED source is never hidden" guarantee stated at DAY_SOURCE_FLAGS below.
    // The codebase already committed to the guarded idiom on the backend for exactly this
    // class (hazardTaxonomy.js's T-18-01 note; node_helper.js's own hasOwnProperty guard), so
    // this applies that decision to the frontend's four payload-keyed lookups rather than
    // making a new one. Reachability, stated honestly: `dimensionOf()` is itself guarded and
    // `source` is a string literal at every emission site, so no remote input reaches these
    // keys through today's backend — the defect was that the containment posture was asserted
    // rather than implemented.
    const lookup = (map, key, fallback) => (
      Object.prototype.hasOwnProperty.call(map, key) ? map[key] : fallback
    );
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
    // 19-REVIEW CR-03: escapes UNCONDITIONALLY. The split form escaped only the fallback
    // branch, so on a prototype-chain hit the unescaped branch was taken — i.e. the escape
    // decision was being made by whether a prototype lookup happened to hit, which is not a
    // property anything should rely on. Every mapped value is plain ASCII, so escaping the
    // hit branch too is a no-op for real data.
    const detailSourceAttribution = (source) => (
      "   — " + escapeHtml(String(lookup(SOURCE_SHORT_NAMES, source, source)))
    );
    // UI-SPEC "Detail-Mode Column Alignment": the one font-family override this phase
    // introduces, applied per sub-row's own inline style (this render mechanism has no
    // enclosing per-day element to hold it once). Carries white-space:pre-wrap alongside it
    // so the padded content above doesn't collapse to a single space (RPT-06 "Space padding
    // survives to the screen").
    // 19-REVIEW WR-04: escapes only, never truncates. It used to apply
    // truncateHazardLabel to content that ALREADY carried the 13-char dimension field plus
    // its padding, which broke the bound two ways: a pass-through label was cut at ~47
    // source characters in detail mode versus 60 on the compact line, and when the cut did
    // fire the "…" landed mid-field and destroyed the column grid the whole detail layout
    // exists to maintain. It also contradicted T-16-22's rationale (line 266: "truncated
    // BEFORE escaping so the bound counts source characters") by letting padding consume the
    // budget. Both call sites below now truncate their own label content BEFORE padding it,
    // so the bound counts source characters in both modes and padding is never truncatable.
    const detailColoredSpan = (color, content) => (
      "<span style=\"color:#" + validHazardColor(color) +
      ";white-space:pre-wrap;font-family:'DejaVu Sans Mono','Liberation Mono',monospace\">" +
      escapeHtml(content) + "</span>"
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
    //
    // 19-REVIEW WR-06: returns its markup rather than appending to the enclosing `wrapper`
    // by closure. Every other helper in getDom() is a pure string producer; this one and
    // renderHazardsWindowBand were the two exceptions, and both were defined ~200 lines
    // ABOVE the `const wrapper` they mutated — safe only because they happen to be called
    // after that initializer runs, i.e. one reorder away from a TDZ ReferenceError.
    //
    // 19-REVIEW CR-02/CR-03/CR-04: `displayable` is passed IN — the caller's own
    // dayDisplayableHazards(day) — never re-derived from `day.hazards` here. Re-deriving it
    // was the structural cause of all three findings: the compact header one line above
    // renders daySurvivors(day), and a sub-row list built from a different filter
    // contradicted it (a below-floor HeatRisk row, a disabled product's row, an excluded
    // hazards label). Receiving the list makes that disagreement unrepresentable rather than
    // merely fixed. `day` is still needed for convectiveDetailAugment's proximity subtree.
    const renderDaySubRows = (day, displayable) => {
      let html = "";
      const groups = [];
      const groupByDimension = new Map();
      for (const h of displayable) {
        let group;
        if (h.dimension === null || h.dimension === undefined) {
          group = { dimension: null, winner: null, coWinners: [], competitors: [] };
          groups.push(group);
        } else {
          group = groupByDimension.get(h.dimension);
          if (!group) {
            group = { dimension: h.dimension, winner: null, coWinners: [], competitors: [] };
            groupByDimension.set(h.dimension, group);
            groups.push(group);
          }
        }
        // The array already carries survivors-before-suppressed order within a dimension
        // (node_helper.js D-15), so the first suppressedBy===null entry encountered is the
        // winner.
        //
        // 19-REVIEW BL-02: everything else used to become a `competitor`, INCLUDING a second
        // `suppressedBy === null` entry, on the stated assumption that a co-equal survivor
        // would be an invariant violation. It is not: `_addHazardsOutlookGridEntries` dedupes
        // a wpc-hazards day by LABEL (`h.source === "wpc-hazards" && h.label === match.label`),
        // not by dimension, and hazardTaxonomy.js maps several labels onto one dimension
        // (`Heavy Snow`/`Freezing Rain`/`Heavy Ice` → winter, `Hazardous Heat`/`Excessive
        // Heat` → heat, `High Winds`/`Significant Waves` → wind, …). `_resolveGridDayPrecedence`
        // then leaves `suppressedBy: null` on BOTH, because both come from the winning source.
        // Rendering the second as an `also:` row asserted D-05's suppressed-competitor
        // relationship over two peers — while the compact header one line above presented
        // them as peers, i.e. the two modes contradicting each other about the same entry,
        // the class CR-02/03/04's collapse exists to make unrepresentable. Co-winners are now
        // distinguished by what the payload SAYS (`suppressedBy`) rather than by arrival
        // order, and render as full winner-shaped rows.
        if (h.suppressedBy === null) {
          if (!group.winner) group.winner = h; else group.coWinners.push(h);
        } else {
          group.competitors.push(h);
        }
      }
      for (const group of groups) {
        // 19-REVIEW WR-04: a group with no winner used to be DISCARDED, which made this the
        // one place in the file where the fail-safe pointed at hiding rather than showing. A
        // `dimension: null` entry always gets a fresh group with `winner: null` (it groups
        // with nothing), so one carrying `suppressedBy !== null` landed in its own group's
        // `competitors` and rendered in neither mode — while the DAY_SOURCE_FLAGS note two
        // hundred lines below states the opposite posture outright ("an UNLISTED source is
        // never hidden … degrades to today's (visible) behaviour rather than silently
        // disappearing"). Unreachable today (`_resolveGridDayPrecedence` `continue`s on
        // `dimension === null` — never suppresses, never suppressed), but a containment
        // posture that is asserted rather than implemented is the same critique CR-03 made
        // of the prototype-chain lookups.
        //
        // The first competitor is promoted rather than the group being dropped. Nothing is
        // misrepresented by it: `suppressedBy` is not rendered anywhere (an `also:` row does
        // not name its suppressor either), so promotion changes only whether the entry is
        // SEEN, and D-05 already shows suppressed entries in detail mode. Any remaining
        // competitors keep their `also:` rows under it.
        if (!group.winner) {
          if (group.competitors.length === 0) continue;
          group.winner = group.competitors.shift();
        }
        // 19-REVIEW CR-03: `lookup`, not `DIMENSION_LABELS[...]` — a payload dimension of
        // "toString" resolved Object.prototype.toString here, a truthy FUNCTION the `||`
        // could not fall back past, and `.padEnd` on it took the whole render down.
        // 19-REVIEW WR-04: the unmapped-dimension fallback is the payload's own string and is
        // therefore unbounded, so it is truncated on its OWN account (T-16-20's 1 MB DOM node
        // rule) rather than by spending the label's 60-character budget — a mapped dimension
        // is at most 12 characters and this is a no-op for it.
        const dimensionField = truncateHazardLabel(String(group.dimension === null
          ? ""
          : lookup(DIMENSION_LABELS, group.dimension, group.dimension)
        )).padEnd(DIMENSION_FIELD_WIDTH);
        // D-07: the convective sub-row's inside-mode proximity badge and three-shape
        // probabilistic sub-line are relocated here, detail-only — every other dimension
        // has no `detail` sub-object at all, so this is a no-op for them.
        // 19-REVIEW BL-02: the dimension field is written on the group's FIRST winner row
        // only; a co-winner row leaves it blank, exactly as the `also:` rows below do, so the
        // dimension still reads as one labelled block and the co-winner is visibly a peer of
        // the row above it rather than a subordinate of it. Padded to the first row's own
        // rendered width rather than to DIMENSION_FIELD_WIDTH, so an unmapped dimension whose
        // payload string overruns the field (WR-04's own-account truncation above) still
        // columns correctly.
        const blankDimensionField = "".padEnd(dimensionField.length);
        // D-07: the convective augment is read PER ENTRY, not once for the group — its whole
        // input is `entry.detail` (plus the day's proximity subtree), so a co-winner carrying
        // its own detail keeps its own probabilistic sub-line and an entry without one
        // contributes nothing. Every non-convective dimension has no `detail` at all, so this
        // is a no-op for them.
        // WR-04: truncate the label content itself, then pad — the 60-char bound counts
        // source characters (T-16-22), never the dimension field or the padding, and the
        // ellipsis can only ever land at the end of the label rather than mid-column.
        //
        // 19-REVIEW WR-04 (iteration 2): the bound is applied to the ENTRY'S OWN TEXT, and
        // the module-authored proximity badge is composed around the truncated result rather
        // than inside it. Truncating `label + labelSuffix` meant a long label ate the badge
        // and the "…" landed on the badge instead of the label — while the compact line
        // counted its DIMENSION PREFIX against the same budget, so the two modes measured two
        // different strings and could cut the same label at two different points. T-16-22's
        // stated intent is that the bound counts SOURCE characters; the badge and the prefix
        // are neither source-controlled nor unbounded.
        const winnerRows = [group.winner].concat(group.coWinners);
        for (let i = 0; i < winnerRows.length; i++) {
          const entry = winnerRows[i];
          const augment = group.dimension === "convective"
            ? convectiveDetailAugment(day, entry)
            : { labelSuffix: "", subLineHtml: "" };
          const labelContent = truncateHazardLabel(entryText(entry)) + augment.labelSuffix;
          const paddedFieldContent =
            (i === 0 ? dimensionField : blankDimensionField) +
            labelContent.padEnd(DETAIL_LABEL_FIELD_WIDTH);
          html += "<span style=\"white-space:pre-wrap\">" + "  " +
            detailColoredSpan(entry.color, paddedFieldContent) +
            detailSourceAttribution(entry.source) + "</span><br/>";
          if (augment.subLineHtml) html += augment.subLineHtml;
        }
        for (const competitor of group.competitors) {
          // 17 literal spaces (2 + the dimension field width + 2 more), derived rather than
          // hardcoded so it stays in step with DIMENSION_FIELD_WIDTH above.
          const alsoIndent = " ".repeat(2 + DIMENSION_FIELD_WIDTH + 2);
          // The label field's remaining width once "also: " (6 chars) has already
          // consumed part of it — derived so the em dash still lands on the winner row's
          // own column regardless of DETAIL_LABEL_FIELD_WIDTH/DIMENSION_FIELD_WIDTH.
          const alsoLabelFieldWidth = DETAIL_LABEL_FIELD_WIDTH - 2 - "also: ".length;
          // WR-04: same truncate-then-pad order as the winner row above.
          const competitorLabel = truncateHazardLabel(
            entryText(competitor)
          ).padEnd(alsoLabelFieldWidth);
          html += "<span style=\"white-space:pre-wrap\">" + alsoIndent + "also: " +
            detailColoredSpan(competitor.color, competitorLabel) +
            detailSourceAttribution(competitor.source) + "</span><br/>";
        }
      }
      return html;
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
    // WR-01: `applyDisplayGates` has the same meaning and the same default as it does on
    // hazardEntryDisplayable above. The elapsed-window term is structural (a wholly-elapsed
    // window is not a forecast under any config) and always applies; only the showDrought /
    // excluded-label filter is a display gate.
    const renderableWindowEntries = (windowBand, applyDisplayGates) => {
      if (!Array.isArray(windowBand)) return [];
      // 19-REVIEW WR-01: the label is type-checked STRUCTURALLY, alongside the elapsed-window
      // term and for the same reason — a band entry with no usable label has nothing to say,
      // and `truncateHazardLabel`'s `String(label)` turned that into the literal word
      // "undefined" in the rendered band. This is the rule the day path made structural this
      // iteration (`entryText(h) === ""` in `hazardEntryDisplayable`) and the one `cigLabel`
      // states as "no segment rather than a bad one"; the band was the last site not carrying
      // it. Backend-unreachable today (`_hazardMatchesFromHits` rejects a non-string or empty
      // label), so this is defense in depth — but it belongs in the SHARED predicate, so the
      // empty-render discriminator and the renderer keep agreeing about what the band holds.
      return windowBand.filter((entry) => (
        entry && typeof entry === "object" &&
        typeof entry.label === "string" && entry.label.length > 0 &&
        !(typeof entry.offsetEnd === "number" && entry.offsetEnd < 0) &&
        (applyDisplayGates === false || hazardsLabelDisplayable(entry.label))
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
    // WR-01: `applyDisplayGates` again, same meaning and default — false collects every
    // advisory the payload carries regardless of this instance's per-source toggles, which is
    // what the empty-render discriminator needs and what nothing else may use.
    // 19-REVIEW WR-02: what makes an advisory entry renderable, as one predicate. The render
    // loop's own guard said it was there to prevent "undefined in effect." but only tested
    // `!entry || typeof entry !== "object"`, so `{}` produced exactly the string the guard
    // names — `escapeHtml(undefined)` is `"undefined"`. The label is the entry's whole
    // content (the hazard type is an optional suffix, D-06), so an entry without one has
    // nothing to say, the same structural rule `hazardEntryDisplayable` applies to a day
    // entry and `renderableWindowEntries` to a band entry.
    const advisoryEntryDisplayable = (entry) => (
      !!entry && typeof entry === "object" &&
      typeof entry.label === "string" && entry.label.length > 0
    );
    const enabledAdvisories = (applyDisplayGates) => {
      const advisories = (this.spcrisk && this.spcrisk.advisories) || {};
      const lines = [];
      for (const key of Object.keys(ADVISORY_SOURCES)) {
        // 19-REVIEW WR-01: strict `!== true`, not `!...`. This file states the convention at
        // hazardEntryDisplayable ("an absent or non-boolean flag behaves like false, per
        // CFG-01's default") and pins it with a probe, but this gate read the same class of
        // flag by truthiness — so a `showSPCMD: "yes"` rendered the advisory while a day row
        // under the same config was hidden. One flag, one direction, at every site.
        if (applyDisplayGates !== false && this.config[ADVISORY_SOURCES[key]] !== true) continue;
        // 19-REVIEW WR-03: filtered through the SAME predicate the render loop applies, so
        // the ungated reading and the render agree about what counts as an advisory — the
        // "one predicate, both readings" rule `hazardEntryDisplayable` and
        // `renderableWindowEntries` already establish for the day and band paths. Spreading
        // the raw array made `advisories: { spcMD: [null] }` ungated content, so the render
        // loop skipped the entry, nothing appeared, and the empty-state ladder concluded
        // "(filtered by settings)" — sending the operator to check a config that filtered
        // nothing, over what is actually a malformed payload. WR-01's three-way split is
        // worth having only if each string describes the state it names.
        if (Array.isArray(advisories[key])) {
          lines.push(...advisories[key].filter(advisoryEntryDisplayable));
        }
      }
      return lines;
    };
    // D-05: this is its own labeled region within the combined band (RPT-04) —
    // deliberately not folded into the advisory sub-section's own styling. That
    // sub-section holds things in effect NOW (MDs/MPDs are 1-6h nowcasts); "in effect"
    // wording does not apply to a 5-to-7-day forecast window, so the window band keeps
    // its own "Extended Hazards:" heading as its self-identification instead.
    //
    // 19-REVIEW WR-06: returns its markup rather than appending to the enclosing `wrapper`
    // by closure, for the same reason renderDaySubRows does — see that function's note.
    const renderHazardsWindowBand = (windowBand) => {
      // ERO-03 / 15 D-09: absence is silence applies to the band as a whole — a
      // missing/non-array windowBand renders nothing, not even the heading.
      if (renderableWindowEntries(windowBand).length === 0) {
        return "";
      }
      let html = "";
      let headingWritten = false;
      // D-07: ordering is the payload array's order, untouched — the backend already
      // applied the registry order (span start, ties broken by registry order);
      // re-sorting here would put the ordering rule at two sites.
      //
      // WR-04: iterate the SHARED predicate, not `windowBand` with a local copy of the
      // filter. The "a wholly-elapsed window is not a forecast, and rendering it would
      // be worse than silence" rule now lives in exactly one place
      // (renderableWindowEntries) and the no-risk gate reads the same definition, so the
      // two cannot disagree about whether this band has anything to say.
      for (const entry of renderableWindowEntries(windowBand)) {
        if (!headingWritten) {
          html += "Extended Hazards:<br/>";
          headingWritten = true;
        }
        // D-08/D-06: both weekday and offset carry the feature's own observed span,
        // never the layer's nominal window (D-06) — a D8-14 layer can carry a 2-day
        // feature. Omit the weekday pair rather than leak NaN when either date is
        // unparseable; the offset segment survives on its own.
        const startWeekday = hazardsWeekdayFromDate(entry.startDate);
        const endWeekday = hazardsWeekdayFromDate(entry.endDate);
        const singleDay = entry.offsetStart === entry.offsetEnd;
        // 19-REVIEW BL-03: an entry whose window STARTED in the past but has not ended
        // (`offsetStart < 0 <= offsetEnd`) passes the elapsed-window filter, which only drops
        // `offsetEnd < 0`. That is not a synthetic shape: `_bucketHazardMatch` routes every
        // non-precipitation group to the band with its own raw observed span and no lower
        // clamp, so a multi-day WPC/CPC feature that began yesterday is an everyday payload.
        // Rendering its raw start produced `Mon–Fri (D0–4)` under a grid whose first row is
        // Day 1 — the band disagreeing with the grid directly above it about what day it
        // means, the very defect the `+ 1` conversion below was introduced to fix.
        //
        // The elapsed portion is not forecastable content, so it is not advertised at all:
        // the range is rendered open at the low end ("through Fri (→D4)") rather than
        // clamped to a start day the feature did not actually begin on. Clamping would have
        // put a start weekday in the past beside a present-day offset, which is the same
        // two-halves-disagreeing shape one level down.
        const startedInPast = typeof entry.offsetStart === "number" && entry.offsetStart < 0;
        let weekdaySegment = "";
        if (startedInPast) {
          if (endWeekday) weekdaySegment = "through " + endWeekday + " ";
        } else if (startWeekday && endWeekday) {
          weekdaySegment = (singleDay ? startWeekday : startWeekday + "–" + endWeekday) + " ";
        }
        // WR-06: coerce rather than trust the payload's types. These were the only
        // payload-sourced values in either hazards renderer that reached innerHTML
        // skipping BOTH escapeHtml and a type guard — while the elapsed-window guard
        // three lines above does type-check `offsetEnd`. They are structurally numbers
        // today (`Math.round` of a `Number.isFinite`-validated input), so this is not an
        // exploitable XSS; it is this file's own WR-12 rule that nothing remote-sourced
        // reaches the DOM without one of the two.
        // Phase 19 gap closure (19-08 Run B, operator-observed): `offsetStart`/`offsetEnd`
        // are 0-BASED offsets from today (`_hazardDayOffset`'s contract: "0 = today"), but
        // `D<n>` here — like `Day N` on every day block above, and like the NWS product
        // names these features come from — is 1-BASED. Rendering the raw offset put
        // "Wed (D2)" under a day list whose own Day 1 was Monday, i.e. the band disagreed
        // with the grid directly above it about what day it meant. The backend's grid path
        // already applied this same `+ 1` inline; both now go through the one named
        // conversion so they cannot drift apart again.
        // 19-REVIEW BL-03: the `Math.max(1, ...)` floor is a second line of defence, not the
        // fix — the `startedInPast` branch below never asks this helper for an elapsed start.
        // It is here so that no future call site can reintroduce a `D0`/`D-1` the grid above
        // has no row for, which is the one thing this segment must never say.
        const off = (n) => (typeof n === "number" && isFinite(n)
          ? String(Math.max(1, Math.trunc(n) + 1))
          : "?");
        const offsetSegment = startedInPast
          ? "(→D" + off(entry.offsetEnd) + ")"
          : (singleDay
            ? "(D" + off(entry.offsetStart) + ")"
            : "(D" + off(entry.offsetStart) + "–" + off(entry.offsetEnd) + ")");
        const label = "<span style=\"color:#" + validHazardColor(entry.color) + "\">" +
          escapeHtml(truncateHazardLabel(entry.label)) + "</span>";
        html += weekdaySegment + offsetSegment + ": " + label + "<br/>";
      }
      return html;
    };
    // 19-REVIEW CR-03: the day path's half of WR-09, restored. Pre-19 every per-product day
    // section carried its own `this.config.showX &&` term (`9143705:MMM-SPCOutlook.js:731`,
    // `:734`, `:750`, `:768`); the unified loop carried none, so correctness depended
    // entirely on the backend never emitting a disabled product. It does emit them, by
    // design and by necessity: node_helper.js:4192-4198 states the grid is "always present,
    // regardless of this._products.showHazardsOutlook", and node_helper's `_products` is
    // SHARED across MagicMirror instances of the same module type (node_helper.js:727 —
    // "whichever polled first decided for both"), so backend-side display filtering is
    // impossible in principle. Fetch policy is the backend's; display policy is per-instance
    // and therefore has to live here.
    //
    // Each key is a DAY_SOURCE_IDS source id and each value is that source's registry
    // `configFlag`. `spc-convective` and `spc-fire` have no registry configFlag — they are
    // always-on (14 D-08) — and are intentionally absent rather than mapped to a nonexistent
    // flag. The fail-safe direction documented at lines 497-508 is preserved: an UNLISTED
    // source is never hidden, so a future source that forgets this table degrades to today's
    // (visible) behaviour rather than silently disappearing.
    const DAY_SOURCE_FLAGS = {
      "wpc-ero": "showExcessiveRain",
      "wpc-wssi": "showWinterImpact",
      "wpc-hazards": "showHazardsOutlook",
      "heatrisk": "showHeatRisk"
    };
    // 19-REVIEW CR-02/CR-03/CR-04: the ONE definition of "may this hazard entry be shown at
    // all", consulted by every day-side consumer. CR-02 existed because renderDaySubRows
    // re-derived its own hazard list from `day.hazards` and re-implemented only part of this,
    // so an expanded day contradicted the compact header one line above it. Everything that
    // decides visibility now reads this single predicate; the ONLY thing that separates a
    // winner from an `also:` competitor is the `suppressedBy` term, which lives in
    // daySurvivors below rather than here (D-05's competitor rows must still render).
    //
    // 19-REVIEW WR-01: `applyDisplayGates` exists so the empty-render discriminator can ask
    // "what WOULD have rendered with this instance's settings ignored?" without a second,
    // separately-maintained copy of this predicate — writing one would reintroduce exactly the
    // CR-02/CR-03/CR-04 drift this function was created to collapse. False keeps only the
    // structural terms (a well-formed entry); true adds the three config-driven display gates.
    // It is true by default, so every render path gets the gates without asking and only the
    // discriminator has to opt out.
    const hazardEntryDisplayable = (h, applyDisplayGates) => {
      if (!h || typeof h !== "object") return false;
      // 19-REVIEW WR-02: an entry with no text to render is STRUCTURALLY undisplayable, so
      // this term sits above the applyDisplayGates escape hatch alongside the shape check —
      // no config makes an entry with neither `text` nor `label` renderable, and the
      // discriminator must not count it as content the user's settings hid. Placing it here
      // rather than at each render site is what keeps the compact header, the detail
      // sub-rows and the ungated reading from disagreeing about it: previously the compact
      // line rendered the literal "undefined" for such an entry while its own sub-row
      // rendered a blank field on the same screen.
      if (entryText(h) === "") return false;
      if (applyDisplayGates === false) return true;
      // 17 D-01/D-02, RPT-06 checklist row 30: showMinorHeat is a frontend-only DISPLAY
      // FLOOR applied to heatrisk-sourced entries specifically — 1 (minor+) when true, 2
      // (moderate+) by default. wpc-hazards' binary "Hazardous Heat" has no severity ladder
      // (FLOOR_PREBAKED) and is unaffected. A below-floor heatrisk entry already cleared the
      // backend's own presence floor (category >= 1) to reach the payload at all; this is
      // the stricter, frontend-only floor on top of that.
      const heatFloor = this.config.showMinorHeat === true ? 1 : 2;
      if (h.source === "heatrisk" && typeof h.value === "number" && h.value < heatFloor) return false;
      // CR-03: strict `!== true`, matching the showDrought/showMinorHeat convention exactly —
      // an absent or non-boolean flag behaves like false, per CFG-01's default.
      // 19-REVIEW CR-03: `lookup`, not `DAY_SOURCE_FLAGS[...]` — a payload source of
      // "constructor" resolved Object.prototype.constructor here, making `flag` a function
      // whose `this.config[flag]` is undefined, which hid the entry. That inverts the
      // fail-safe direction the note above promises (an unlisted source is never hidden).
      const flag = lookup(DAY_SOURCE_FLAGS, h.source, null);
      if (flag && this.config[flag] !== true) return false;
      // CR-04: the 16-REVIEW WR-01 second-line-of-defense label filter, restored to the day
      // path. Pre-19 `renderableDayHazards` (`9143705:MMM-SPCOutlook.js:343-348`) ran every
      // hazards-outlook day hazard through it "so the day grid and the band cannot disagree
      // about what this config permits either"; after the rewrite `renderableWindowEntries`
      // was its only caller and the day rows rendered drought/flooding labels unfiltered.
      // Scoped to `wpc-hazards` because that is the product whose vocabulary these lists
      // restate (and the exact scope the pre-19 caller had) — applying it to every source
      // would let a listed label hide another product's entry, the one direction the
      // fail-safe note at lines 503-508 forbids.
      if (h.source === "wpc-hazards" && !hazardsLabelDisplayable(h.label)) return false;
      return true;
    };
    // Every displayable entry for a day, winners AND suppressed competitors, in payload
    // order (18 D-15 already fixed taxonomy order; never re-sort — RPT-06 checklist row 25).
    // This is what detail mode's sub-rows iterate, so a competitor is subject to exactly the
    // same floor/toggle/label gates as a winner.
    const dayDisplayableHazards = (day, applyDisplayGates) => {
      if (!day || typeof day !== "object" || !Array.isArray(day.hazards)) return [];
      return day.hazards.filter((h) => hazardEntryDisplayable(h, applyDisplayGates));
    };
    // Phase 19 (RPT-01/RPT-02/RPT-03/D-01–D-03): the array of a day's surviving hazard
    // entries. Declared once, called from both the render-decision site and the render body
    // (WR-04's rule) so the two can never disagree about which days render — and now derived
    // from dayDisplayableHazards rather than re-filtering `day.hazards`, so the compact
    // header and the expanded sub-rows cannot disagree about which ENTRIES render either.
    const daySurvivors = (day, applyDisplayGates) => (
      dayDisplayableHazards(day, applyDisplayGates).filter((h) => h.suppressedBy === null)
    );
    // D-08: true when a day has no surviving hazard but proximityWeighting is on and the
    // day's outside-mode categorical proximity is renderable — the one named exception to
    // D-03's "no survivor, no row" rule, so the shipped v1.2 PROXUI outside-mode behaviour
    // is not lost at default config.
    const dayProximityOnly = (day) => (
      daySurvivors(day).length === 0 &&
      this.config.proximityWeighting === true &&
      hasRenderableProximity(day && day.proximity && day.proximity.categorical)
    );
    // 19-REVIEW CR-01: the D-08 exception's half of WR-04's "gate and render read the same
    // predicate" rule. `summary.anyHazard` is `anyDayHazard || windowBandCount > 0 ||
    // advisoryCount > 0` (node_helper.js's `_buildGridSummary`), where `anyDayHazard` is
    // purely a `suppressedBy === null` scan over `day.hazards` — PROXIMITY IS NOT A TERM IN
    // IT. So on the only payload D-08 exists for (nothing active anywhere, a nearby polygon
    // edge) `anyHazard` is false, the no-risk short-circuit below fired, and the proximity
    // row was unreachable against any payload the backend can actually emit. The pre-19 gate
    // carried three `!hasAnyRenderableProximity(dayN.proximity)` terms
    // (`9143705:MMM-SPCOutlook.js:434-436`) that the rewrite dropped; this is their
    // successor, expressed through `dayProximityOnly` — the SAME predicate the render branch
    // consults — so the gate and the row it starves cannot drift apart again.
    const anyProximityOnlyDay = () => {
      const days = this.spcrisk && this.spcrisk.days;
      if (!days || typeof days !== "object") return false;
      for (let n = 1; n <= 14; n++) {
        if (dayProximityOnly(days[String(n)])) return true;
      }
      return false;
    };
    // Phase 19 gap closure (19-08 Run A, operator decision): the all-clear string is
    // "No Hazards Forecast", not the legacy "No Severe Weather Risk". v1.x was an
    // SPC-convective-only module and "severe weather" was accurate then; v2.0 merged in
    // WPC ERO, WSSI, MPD, CPC Hazards Outlook and NWS HeatRisk, so the gate now clears on
    // drought, heat, cold, wind and heavy precipitation too — none of which is severe
    // weather in the SPC sense. The old wording asserted something narrower than what was
    // actually checked, which is the same class of dishonesty CR-01 guards against at the
    // staleness end. Declared once here because the confident and unconfirmed forms MUST
    // NOT drift apart: the unconfirmed string is the contentMarker fallback for exactly
    // the state the confident string is forbidden to claim.
    const NO_HAZARD_TEXT = "No Hazards Forecast";
    const NO_HAZARD_TEXT_UNCONFIRMED = NO_HAZARD_TEXT + " (unconfirmed)";
    // 19-REVIEW WR-01 (operator decision): the third form. The confident string asserts
    // "upstream was checked and there is nothing"; the unconfirmed form asserts "this
    // all-clear was never confirmed". Neither is honest about a fresh, fully confirmed
    // payload that DID carry content which this instance's own settings then hid — saying
    // "No Hazards Forecast" hides a config mistake, and saying "(unconfirmed)" slanders a
    // clean poll and trains the operator to ignore the word that CR-01 makes load-bearing.
    // Declared beside its two siblings for the same reason they are declared together: the
    // three forms describe three different states and must never drift into each other.
    const NO_HAZARD_TEXT_FILTERED = NO_HAZARD_TEXT + " (filtered by settings)";
    // WR-01: "would ANYTHING have rendered if this instance's display settings were ignored?"
    // — the discriminator between the confident and the filtered form, and the ONLY caller
    // that passes `applyDisplayGates: false`. It reads the same three predicates the render
    // path reads (`daySurvivors`, `renderableWindowEntries`, `enabledAdvisories`), just with
    // the gates off, so a future gate added to any of them is automatically understood here
    // too — there is no second copy of the survivor logic to keep in step.
    //
    // Scope is the WHOLE render, not just the day grid: the window band is gated on
    // `showHazardsOutlook` and the advisory sub-section on `ADVISORY_SOURCES`, so content
    // hidden by either is equally "filtered by settings".
    //
    // `proximityWeighting` is deliberately NOT treated as a display gate. Unlike the gates
    // above it travels in buildRequestPayload's request and changes what the backend
    // computes, so "off" is not a display filter over content that exists — and D-08's
    // proximity-only row reads it identically whether or not the gates are applied, so it
    // could never distinguish the two readings anyway.
    const anyUngatedContent = () => {
      const days = this.spcrisk && this.spcrisk.days;
      if (days && typeof days === "object") {
        for (let n = 1; n <= 14; n++) {
          if (daySurvivors(days[String(n)], false).length > 0) return true;
        }
      }
      if (renderableWindowEntries(this.spcrisk && this.spcrisk.windowBand, false).length > 0) {
        return true;
      }
      return enabledAdvisories(false).length > 0;
    };
    const wrapper = document.createElement("div");
    // Phase 19 gap closure (19-08 Run B, operator-observed): UI-SPEC's "Layout Grammar"
    // defines the detail sub-row column contract as character offsets "measured from the
    // left margin of the day block", and states that hierarchy in this module is carried
    // "entirely structural (indentation + color/neutral split)" — no font-size or border
    // cue. Both assume a left margin. Deployed in a right-hand MagicMirror region the
    // wrapper inherits `text-align: right`, and because a padded sub-row (~42 cols) is
    // wider than the compact header above it, the sub-row extends PAST the header's left
    // edge — inverting the indentation and making sub-rows read as siblings of the day
    // headers rather than children of them. Anchoring this module's own text stream to the
    // left keeps the shipped column contract correct as written; the region placement is
    // unaffected. Probe-invisible by construction (the DOM stub cannot observe alignment),
    // so this is a MANUAL ONLY row — see 19-PARITY-CHECKLIST.md "Probe Coverage".
    wrapper.style.textAlign = "left";
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
      // 19-REVIEW WR-02 (operator decision): the RPT-05/18 D-16 "No Products Enabled" branch
      // that used to sit here is RETIRED. It could not fire against any payload the backend
      // is capable of emitting: `_buildSourceHealth` marks `spc-convective` and `spc-fire`
      // `enabled: true` unconditionally (node_helper.js, `isAlwaysOn`), and neither has a
      // `configFlag` in productRegistry.js or a flag in this file's own `defaults` — they are
      // the always-on core and there is no config that turns them off. So
      // `summary.enabledSourceCount` has a hard floor of 2. That is a product fact, not a
      // wiring bug, and the operator declined to add toggles for the always-on core to make
      // the branch reachable. The real user-facing state this branch was reaching for — "your
      // settings are why this is empty" — is answered instead by NO_HAZARD_TEXT_FILTERED at
      // the contentMarker fallback below, which is driven by what actually got filtered
      // rather than by a count that cannot reach zero. `summary.enabledSourceCount` itself
      // is still emitted (D-16 locks the field) and is documented as diagnostic-only in
      // node_helper.js's `_buildGridSummary`.
      //
      // CR-01: staleness disqualifies this short-circuit entirely, preserved verbatim from
      // the legacy gate's own `!this.spcrisk._stale` term — a degraded read must still reach
      // the main branch below so the ⚠ badge renders, with "No Hazards Forecast
      // (unconfirmed)" supplied underneath it by the contentMarker fallback (unchanged),
      // rather than a bare confident string standing in for a read that was never confirmed.
      // Only the source of "no risk" changed, from a ~15-term boolean expression to one
      // summary.anyHazard read (18's unified merge already unions every day survivor, the
      // window band and the advisories into this one flag).
      //
      // 19-REVIEW CR-01: ...with one term `anyHazard` structurally cannot supply. It unions
      // survivors, the band and the advisories — never proximity — so D-08's proximity-only
      // day is content this short-circuit would otherwise assert an all-clear over while the
      // payload holds the data. See `anyProximityOnlyDay` above.
      summaryOk && summary.anyHazard === false && !this.spcrisk._stale && !anyProximityOnlyDay()
    ) {
      wrapper.innerHTML = NO_HAZARD_TEXT;
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
            // 19-REVIEW WR-03: `autoExpand` is computed by `_resolveGridDayAutoExpand` on the
            // UNGATED payload, so scanning the flag alone let a day whose only significant
            // entry belongs to a product this instance has disabled flip the entire render
            // into detail rhythm — every rendered day acquiring a trailing blank line while
            // NOTHING anywhere expands. The rule one comment above is "once ANY day IN THIS
            // RENDER is in detail mode", and a gated-away day is not in this render; the
            // `daySurvivors` term is what makes the scan read the same set the day loop below
            // actually renders and expands. A proximity-only day is excluded for the same
            // reason: it renders, but its `continue` below means it never expands.
            if (d && d.autoExpand === true && daySurvivors(d).length > 0) detailModeActive = true;
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
            // 19-REVIEW CR-01: `nextTier` inside the badge is `best.label` from
            // computeProximity — a LABEL property harvested from remote SPC GeoJSON — and
            // proximityBadge()'s plain-tier branch passes it through verbatim. Escaped here
            // for the same reason the three probabilistic sub-line call sites are (T-19-18):
            // this branch reaches innerHTML without passing through detailColoredSpan's own
            // escapeHtml, so it is the one badge call site that had no escape at all.
            wrapper.innerHTML += "<span style=\"white-space:pre-wrap\">" + prefix + " " +
              escapeHtml(proximityBadge(day.proximity && day.proximity.categorical, "outside")) +
              "</span><br/>";
            if (detailModeActive) wrapper.innerHTML += "<br/>";
            continue;
          }
          // Compact line grammar (UI-SPEC "Layout Grammar"): prefix, exactly two literal
          // spaces, then hazard segments joined by " · " (U+00B7, outside every span).
          // This is the exact same header restated verbatim when the day expands below
          // (D-06) — never rebuilt as a second, different header string.
          const segments = survivors.map((h) => {
            // 19-REVIEW CR-03: `lookup`, not `DIMENSION_LABELS[...]` — same prototype-chain
            // reason as the detail sub-row's dimension field.
            // 19-REVIEW WR-04: the 60-char bound is applied to the ENTRY'S OWN TEXT, the same
            // string the detail sub-row applies it to, so the two modes can no longer cut the
            // same label at two different points. It used to be applied to
            // `dimensionLabel + " " + label`, which let up to 13 characters of
            // MODULE-AUTHORED prefix consume a budget T-16-22 says counts source characters.
            // The prefix is truncated on its own account instead — a no-op for a mapped
            // dimension (12 chars at most), and T-16-20's unbounded-payload-string protection
            // for the unmapped passthrough.
            const labelText = truncateHazardLabel(entryText(h));
            const segmentText = (h.dimension !== null && h.dimension !== undefined)
              ? truncateHazardLabel(String(lookup(DIMENSION_LABELS, h.dimension, h.dimension))) +
                " " + labelText
              : labelText;
            return "<span style=\"color:#" + validHazardColor(h.color) + "\">" +
              escapeHtml(segmentText) + "</span>";
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
            // WR-06: the renderer returns its markup; the day loop owns every write to
            // `wrapper`. dayDisplayableHazards(day) is `survivors` plus the suppressed
            // competitors D-05 renders as `also:` rows — the same list, same predicate.
            wrapper.innerHTML += renderDaySubRows(day, dayDisplayableHazards(day));
          }
          if (detailModeActive) wrapper.innerHTML += "<br/>";
        }
      }
      // RPT-04: one combined band below every day block — the advisories sub-section then
      // the Hazards Outlook window band, in that order. This is a deliberate reordering
      // (RPT-04-RELOC on the parity checklist), not a parity target: today's renderer puts
      // the advisory band above the day rows and the window band at the very end: both now
      // render here instead. No unifying heading is introduced — the advisories' own blue
      // color and the window band's own "Extended Hazards:" heading each identify their own
      // content, so a third label would be new copy nobody asked for. The blank-line
      // separator between the last day block and this band's first line comes for free from
      // the day loop's own trailing `<br/>` in detail mode (the same vertical-rhythm rule
      // used between two day blocks); compact mode already has no such separator between
      // rows, so the band reads as one more block either way.
      //
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
        // Guard the entry itself: skip an entry with no renderable label rather than
        // rendering "undefined in effect." — the failure class CR-02 already fixed once on
        // the backend.
        // 19-REVIEW WR-02: this guard used to stop at `!entry || typeof entry !== "object"`,
        // which let `{}` through and produced verbatim the string it names. It now reads the
        // shared `advisoryEntryDisplayable`, so the field the guard is actually about is the
        // field it tests — and the ungated reading uses the same predicate (WR-03).
        if (!advisoryEntryDisplayable(entry)) continue;
        let line = escapeHtml(entry.label);
        // D-06: a hazard type is only ever a non-empty string when present — an MPD whose
        // hazard type could not be parsed renders without the suffix rather than being
        // dropped, degrading to exactly today's MD behaviour.
        if (typeof entry.hazardType === "string" && entry.hazardType.length > 0) {
          line += " — " + escapeHtml(entry.hazardType);
        }
        wrapper.innerHTML += "<span style=\"color: #0059E0\">" + line + " in effect.</span><br/>"
      }
      // Gated on the same flag the no-risk gate terms use (WR-09 — gate and render must
      // agree about what is displayable). Placed before the contentMarker comparison so
      // a stale payload carrying real hazards renders its content and not a bare ⚠
      // badge (D-16, CR-01). Reads the top-level, always-present `windowBand` array
      // (RPT-04) rather than the legacy `hazardsOutlook.windowBand` — the day3-14 grid
      // this block used to also render is covered by the unified day loop above.
      //
      // 19-REVIEW WR-01: strict `=== true`, matching hazardEntryDisplayable's DAY_SOURCE_FLAGS
      // gate on this same flag. A bare truthiness test here meant `showHazardsOutlook: "yes"`
      // hid every wpc-hazards DAY ROW (the day gate is `!== true`) while still rendering the
      // window band — the same flag gating two halves of one product in opposite directions,
      // which is precisely the split-brain WR-09's doctrine above exists to prevent.
      if (this.config.showHazardsOutlook === true) {
        wrapper.innerHTML += renderHazardsWindowBand(this.spcrisk.windowBand);
      }
      // CR-01: a stale payload with no renderable risk must not present as a bare ⚠ badge.
      // "unconfirmed" rather than "last known good" because the two cases are not
      // distinguishable here: the values may be a still-fresh cached reading served by
      // rejectBody's stale fallback, or the no-risk defaults left by a hard failure with
      // nothing to fall back to. Either way the one thing the display can honestly assert
      // is that this all-clear was not confirmed against upstream.
      if (wrapper.innerHTML === contentMarker) {
        // 19-REVIEW WR-01 (operator decision): three states reach this line, and they used to
        // all say "(unconfirmed)".
        //
        // 1. The payload is stale, or its summary is malformed and so cannot be trusted to
        //    assert anything. Unchanged: "(unconfirmed)" is exactly right, and it OUTRANKS
        //    case 2 — if the read was not confirmed, say so first. Explaining a config filter
        //    on top of an unconfirmed read would be describing the second-most-important fact
        //    about the screen. This is CR-01's doctrine and it wins.
        // 2. The payload is fresh and confirmed and DID carry renderable content, and this
        //    instance's own display settings hid all of it. Before the CR-03/CR-04 gates were
        //    restored this state was rare because almost nothing was gated; restoring them
        //    made it ordinary (a user with every product toggle off now lands here on any day
        //    SPC itself is quiet). Saying "(unconfirmed)" here slanders a clean poll and
        //    erodes the word CR-01 depends on; saying nothing at all hides a config mistake
        //    behind an authoritative all-clear.
        // 3. The payload is fresh and confirmed and there was genuinely nothing to show. The
        //    confident string, same as the summary.anyHazard short-circuit above would have
        //    produced — this is the case where the two paths must agree.
        // 4. 19-REVIEW CR-02: the FOURTH state, which the three-way ladder put in case 3's
        //    confident branch — the summary is well-formed, fresh, and asserts
        //    `anyHazard: true`, nothing rendered, and NO display gate explains it (a
        //    truncated or corrupt `days` object, a shape change between helper and
        //    frontend). That is a summary-vs-render disagreement, exactly what
        //    `contentMarker` exists to catch (Pitfall 9, see its note above), and asserting
        //    a confident all-clear over a payload that says a hazard exists is the same
        //    dishonesty CR-01's doctrine forbids at the staleness end. `anyUngatedContent()`
        //    cannot rescue it: it re-reads the same unreadable `days` and therefore also
        //    reports "nothing", so the code would conclude "genuinely nothing to show" from
        //    the very evidence that says the opposite. `!summaryOk` already covered
        //    malformation OF the summary; malformation BELOW it was not covered at all.
        //
        // The window-band term below is the one documented, legitimate way the summary can
        // assert content this render deliberately drops: `_buildGridSummary`'s
        // `windowBandCount` is a raw `windowBand.length`, while `renderableWindowEntries`
        // drops wholly-elapsed windows ("not a forecast under any config") with the display
        // gates OFF too. That is a structural rule rather than a disagreement, so a non-empty
        // raw band explains `anyHazard` by itself and must not be reported as unconfirmed —
        // any RENDERABLE entry in it would have made `anyUngatedContent()` true and never
        // reached this line.
        //
        // 19-REVIEW BL-01: that carve-out has to excuse the BAND TERM, not the whole flag.
        // `anyHazard` is `anyDayHazard || windowBandCount > 0 || advisoryCount > 0`
        // (node_helper.js `_buildGridSummary`), so a bare `rawWindowBandCount === 0` term
        // disabled the disagreement check for every reason the flag could be true — one
        // wholly-elapsed band entry (an everyday payload: `_bucketHazardMatch` routes every
        // non-precipitation feature to the band with its own raw observed span, which
        // routinely started yesterday) beside a truncated `days` object silenced it and
        // reopened CR-02's hole. The narrowing reads the summary's OWN other two terms,
        // both of which D-16 already publishes, so the excuse holds only when the band is
        // the only term that could have set the flag.
        //
        // `gridReadable` is the third condition and is about the RENDER side rather than the
        // summary: the excuse says "the render is empty for a structural reason", which is
        // only assertable when the grid this render walked was actually readable. With
        // `days` null or shape-drifted, `anyUngatedContent()`'s day loop reports "nothing"
        // from evidence it could not read — the exact circularity CR-02's note above names —
        // so a band entry must not license a confident all-clear over it.
        const rawWindowBandCount = Array.isArray(this.spcrisk.windowBand)
          ? this.spcrisk.windowBand.length
          : 0;
        const gridReadable = (() => {
          const days = this.spcrisk.days;
          if (!days || typeof days !== "object") return false;
          for (let n = 1; n <= 14; n++) {
            const day = days[String(n)];
            if (!day || typeof day !== "object" || !Array.isArray(day.hazards)) return false;
          }
          return true;
        })();
        const bandIsTheOnlySummaryTerm =
          rawWindowBandCount > 0 && gridReadable &&
          Array.isArray(summary.activeDays) && summary.activeDays.length === 0 &&
          !!summary.bandDiagnostics && summary.bandDiagnostics.advisoryCount === 0;
        const summaryContradictsRender = summaryOk && summary.anyHazard === true &&
          !bandIsTheOnlySummaryTerm && !anyUngatedContent();
        // Case 1 keeps its documented precedence: an unconfirmed read is said first.
        const unconfirmed = !summaryOk || !!this.spcrisk._stale || summaryContradictsRender;
        if (unconfirmed) {
          wrapper.innerHTML += NO_HAZARD_TEXT_UNCONFIRMED;
        } else if (anyUngatedContent()) {
          wrapper.innerHTML += NO_HAZARD_TEXT_FILTERED;
        } else {
          wrapper.innerHTML += NO_HAZARD_TEXT;
        }
      }
    }
    return wrapper;
  }
});
