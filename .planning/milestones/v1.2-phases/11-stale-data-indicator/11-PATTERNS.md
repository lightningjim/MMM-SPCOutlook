# Phase 11: Stale Data Indicator - Pattern Map

**Mapped:** 2026-04-25
**Files analyzed:** 2 modified files (no new files)
**Analogs found:** 2/2 (both modifications have in-file analogs)

## File Classification

| Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------|------|-----------|----------------|---------------|
| `node_helper.js` | service (MagicMirror² node_helper) | request-response (socket payload + cached fetch) | self — existing `_isWithinStaleWindow` (lines 159–162) and `socketNotificationReceived` (lines 28–37) | exact (in-file refactor) |
| `MMM-SPCOutlook.js` | component (MagicMirror² module) | request-response (socket-out) + render | self — existing `start`/`setInterval` payload (lines 13, 15) and `MD in effect` line in `getDom` (lines 71–74) | exact (in-file refactor) |

## Pattern Assignments

### `node_helper.js` (service, request-response)

**Analog:** self — same file, same helper. The bug fix is structural: change the helper signature, persist `updateInterval` from the socket payload, then update the four existing call sites.

#### Buggy implementation to replace (lines 159–162)

```js
_isWithinStaleWindow(timestamp) {
  const intervalMs = (this.config?.updateInterval ?? 60) * 60 * 1000;
  return (Date.now() - timestamp) < intervalMs;
},
```

The bug: `node_helper` instances do not have a `this.config` — that lives on the front-end module. `this.config?.updateInterval` is always `undefined`, so the helper silently uses the 60-minute fallback regardless of user setting.

#### Socket entry pattern to extend (lines 28–37)

```js
socketNotificationReceived: async function(notification, payload) {
  if (notification === "GET_SPC_DATA") {
    const { lat, lon, extended } = payload;
    const md = await this.getMesoscaleDiscussion(lat, lon);
    const outlook = await this.getSpcOutlook(lat, lon, extended);
    // Send the results back to your front-end module
    this.sendSocketNotification("SPC_DATA_RESULT", [outlook, md]);
  }
},
```

**Apply to this:** destructure `updateInterval` alongside `lat, lon, extended`; persist on `this._updateInterval` with the 60-minute fallback per D-04. Log once at info level when the fallback is taken.

Target shape:

```js
const { lat, lon, extended, updateInterval } = payload;
if (updateInterval === undefined) {
  Log.info("MMM-SPCOutlook: GET_SPC_DATA missing updateInterval, defaulting to 60 minutes");
  this._updateInterval = 60;
} else {
  this._updateInterval = updateInterval;
}
```

(One-shot info log — gate on a `this._loggedIntervalFallback` flag if the planner wants strict "log once" semantics; otherwise current call cadence — once per fetch cycle — is acceptable.)

#### State-init pattern to extend (lines 21–26)

```js
start: function() {
  Log.info("Starting node_helper for MMM-SPCOutlook...");
  this._geoJsonCache = new Map();  // keyed by URL string
  this._cachedLat = null;
  this._cachedLon = null;
},
```

Add `this._updateInterval = 60;` here so the field has a defined default before the first `GET_SPC_DATA` arrives.

#### Call sites to update — four spots in `fetchGeoJsonCached` (lines 169–202)

```js
// line 182 — network error path
if (entry && this._isWithinStaleWindow(entry.timestamp)) {

// line 197 — non-ok HTTP path
if (entry && this._isWithinStaleWindow(entry.timestamp)) {
```

(Two call sites in `fetchGeoJsonCached` per the slice read; CONTEXT.md mentions "four current call sites" — the planner should grep `_isWithinStaleWindow` once to enumerate all of them and update every site to pass `this._updateInterval` as the second arg.)

**Target signature per D-02:**

```js
_isWithinStaleWindow(timestamp, intervalMinutes) {
  const intervalMs = (intervalMinutes ?? 60) * 60 * 1000;
  return (Date.now() - timestamp) < intervalMs;
},
```

Each call site becomes `this._isWithinStaleWindow(entry.timestamp, this._updateInterval)`.

#### Stale flag emission — already correct (lines 617, 784)

```js
return {
  ...(anyStale ? { _stale: true, _staleAsOf: Date.now() } : {}),
  ...
};
```

No change needed here. The frontend already receives `_stale`/`_staleAsOf` correctly; STALE-01 only fixes when `anyStale` becomes true (the stale window now reflects the real `updateInterval`).

---

### `MMM-SPCOutlook.js` (component, request-response + render)

**Analog:** self — both edits have direct in-file analogs.

#### Socket payload — both call sites must change together (lines 13, 15)

```js
this.sendSocketNotification("GET_SPC_DATA", { lat: this.config.lat, lon: this.config.lon, extended: this.config.extended });
// Set an interval to update every hour (3600000 milliseconds)
setInterval(() => {this.sendSocketNotification("GET_SPC_DATA", { lat: this.config.lat, lon: this.config.lon, extended: this.config.extended });}, this.config.updateInterval * 60000);
```

**Cross-file invariant:** these two payload object literals are constructed independently. Both must include `updateInterval: this.config.updateInterval` — if either is missed, the bug returns intermittently (initial fetch correct, interval fetches wrong, or vice versa). Plan and review must check both.

Target:

```js
this.sendSocketNotification("GET_SPC_DATA", { lat: this.config.lat, lon: this.config.lon, extended: this.config.extended, updateInterval: this.config.updateInterval });
setInterval(() => {this.sendSocketNotification("GET_SPC_DATA", { lat: this.config.lat, lon: this.config.lon, extended: this.config.extended, updateInterval: this.config.updateInterval });}, this.config.updateInterval * 60000);
```

#### Indicator render — analog is the `MD in effect` line (lines 70–75)

```js
} else {
  const dow = new Date().getDay();
  wrapper.innerHTML = "";
  if(this.mds) {
    for(const MD of this.mds){
      wrapper.innerHTML += "<span style=\"color: #0059E0\">" + MD + " in effect.</span><br/>"
    }
  }
```

This is the canonical "colored single-line annotation at the top of the data-bearing branch" pattern. The stale indicator should follow it identically: insert immediately after `wrapper.innerHTML = "";` (line 70) and before the `if(this.mds)` block, so the warning sits at the very top of the data-bearing render.

**Inline-style + Unicode + concatenation** is the established pattern across `getDom` (every colored span uses `style="color:#xxxxxx"` and string concatenation — no template literals, no CSS file). Match exactly.

Target shape (with the D-11/D-12 fallbacks):

```js
} else {
  const dow = new Date().getDay();
  wrapper.innerHTML = "";
  if (this.spcrisk._stale) {
    let staleSuffix = "";
    const asOf = this.spcrisk._staleAsOf;
    if (typeof asOf === "number" && !isNaN(asOf)) {
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
```

**Why inside the `else` branch (not at top of `getDom`):** ROADMAP success criterion 4 says no indicator when `_stale === false` or omitted; the `Loading…`/`Error:`/`No Severe Weather Risk` early branches do not have `_stale` to inspect. Placing the indicator inside the data-bearing else-branch matches CONTEXT.md `<code_context>` integration points and the success criteria.

**Why `+=` not `=`:** the `wrapper.innerHTML = ""` reset on line 70 already happens; the indicator and the MD lines and every subsequent line all use `+=`. Reset once, append everything.

---

## Shared Patterns

### Inline coloring via `style="color:#xxxxxx"`
**Source:** `MMM-SPCOutlook.js` lines 73, 78, 89, 99, 104–108, 112–126
**Apply to:** stale indicator span

Every coloured element in the module uses inline `style` with a hex literal. Examples:

```js
"<span style=\"color: #0059E0\">" + MD + " in effect.</span>"            // MD line
"<span style=\"color:#" + this.spcrisk.day1.color + "\">" + ... + "</span>"  // day risk
"<span style=\"color:#" + fireRiskToColor[...] + "\">" + ... + "</span>"     // fire wx
```

Stale indicator must follow this exactly with `#FFCC00` (D-07). Do **not** introduce `MMM-SPCOutlook.css` or `getStyles()` registration (D-08). The existing `getStyles()` (lines 28–32) is already present for `weather-icons` — do not extend it.

### `wrapper.innerHTML = "" / +=` build pattern
**Source:** `MMM-SPCOutlook.js` lines 70 + every subsequent assignment in the else-branch
**Apply to:** all new render content

The else-branch resets once with `=` then appends with `+=`. The stale indicator goes between the reset (line 70) and the existing first append (the `if(this.mds)` block at line 71). Use `+=` since the reset already happened.

### `moment` global
**Source:** MagicMirror² runtime — vendored global, available without import
**Apply to:** stale indicator relative time

Per D-10, `moment(_staleAsOf).fromNow()` produces the desired string. No `require`/`import` needed — `moment` is in scope inside `getDom`. Note: `moment` is **not** currently used elsewhere in `MMM-SPCOutlook.js`, so this introduces a first-use of an existing global. That is consistent with the rest of MagicMirror² module conventions and does not require a new dependency.

### Cache-entry timestamp + helper pattern
**Source:** `node_helper.js` lines 258–264, 279–285, 769–775 (cache `set` calls with `timestamp: Date.now()`)
**Apply to:** call sites of `_isWithinStaleWindow`

Every cache write tags with `timestamp: Date.now()`; `_isWithinStaleWindow` reads that field. The new signature `(timestamp, intervalMinutes)` keeps the helper's symmetry with how the timestamp is produced. No change needed to the cache-write sites.

---

## No Analog Found

None. Every change has a tight in-file analog.

## Cross-File Invariants

- **Frontend↔backend payload contract:** the new `updateInterval` field is added to both ends in lockstep. Frontend adds it to two payload literals (lines 13, 15); backend destructures it in `socketNotificationReceived` (line 31) and persists to `this._updateInterval`. A defensive 60-minute fallback (D-04) is required on the backend so an out-of-sync frontend does not crash, but the planner should still treat the frontend-and-backend edits as a single atomic change.
- **Both frontend payload sites change together:** `start` (line 13) and the `setInterval` callback (line 15) construct the payload independently. Either one alone leaves the bug intermittently present.
- **All `_isWithinStaleWindow` call sites change together:** the signature change requires updating every call site in the same commit. Grep `_isWithinStaleWindow\(` to enumerate before editing.

## Metadata

**Analog search scope:** `node_helper.js`, `MMM-SPCOutlook.js` (in-file analogs only — phase modifies these two files exclusively)
**Files scanned:** 2
**Pattern extraction date:** 2026-04-25
