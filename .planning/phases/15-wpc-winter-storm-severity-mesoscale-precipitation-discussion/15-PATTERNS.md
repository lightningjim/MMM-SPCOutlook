# Phase 15: WPC Winter Storm Severity & Mesoscale Precipitation Discussion - Pattern Map

**Mapped:** 2026-08-23
**Files analyzed:** 5 (all modified, no new files — RESEARCH.md's "Recommended Project Structure" is explicit: no new files are structurally required)
**Analogs found:** 13 / 16 units of work have a live, shipping analog in this repo; 3 are net-new parsing helpers with no analog (cited from RESEARCH.md Code Examples instead)

This phase is "new product, existing pipeline" almost everywhere. `productRegistry.js`'s
`excessiveRain` row and `node_helper.js`'s ERO day-loop are the WSSI template verbatim; the
existing SPC MD pipeline (`getMesoscaleDiscussion` → `fetchBinBuffer` → `extractKmlFromKmz` →
`kmlToGeoJson` → `checkInPolygon`) is the MPD/SPC-MD template, generalized per D-02. No new files;
every unit below is a modification to one of `productRegistry.js`, `node_helper.js`,
`MMM-SPCOutlook.js`, `scripts/probe-payload-resilience.js`, or `scripts/probe-lib/module-stubs.js`.

## File Classification

| Unit of work (function/block to add or modify) | File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|---|
| `winterImpact` registry row (`arcgis-day-layers` kind) | `productRegistry.js` | config | transform | `PRODUCT_REGISTRY.excessiveRain` (productRegistry.js:53-78) | exact |
| `spcMD` registry row (`kml-advisory` kind, migrated) | `productRegistry.js` | config | transform | existing free-function `getMesoscaleDiscussion` (node_helper.js:439-481), reshaped into a row | role-match (migration, not new) |
| `mpd` registry row (`kml-advisory` kind, new discovery) | `productRegistry.js` | config | transform | same as spcMD row, but `discoverCandidates` has no analog | role-match / partial |
| `kind` dispatch (arcgis-day-layers vs kml-advisory) | `productRegistry.js` or `node_helper.js` (Claude's discretion, D-01) | config/service | transform | none — this table has one kind today | no analog (new dispatch shape) |
| WSSI day-loop (fetch/cache/evaluate per day 1-3) | `node_helper.js` | service | CRUD | ERO day-loop (node_helper.js:1353-1428) | exact |
| WSSI payload block assembly | `node_helper.js` (`getSpcOutlook` return) | service | transform | `eroPayload` block (node_helper.js:1422-1428) + `excessiveRain: eroPayload` in the return object (node_helper.js:1540) | exact |
| `kml-advisory` shared loop (generalizes `getMesoscaleDiscussion`) | `node_helper.js` | service | event-driven / batch | `getMesoscaleDiscussion` (node_helper.js:439-481) | role-match (needs generalizing into "per-row" shape) |
| SPC MD `discoverCandidates` (index-based, fix Pitfall 1) | `node_helper.js` | service | request-response | `ActiveMD.kmz` fetch + `parseNetworkLinks` filter (node_helper.js:440-450) | exact (logic to migrate, allowlist bug to fix) |
| MPD `discoverCandidates` (directory-listing + validity window) | `node_helper.js` | service | batch | `parseNetworkLinks` (node_helper.js:206-215) for the "extract hrefs from remote markup" shape only | partial (new HTML-listing parse, no XML/KML precedent) |
| `extractSoleKmlEntry` (find sole `.kml` zip entry) | `node_helper.js` | utility | file-I/O | `extractKmlFromKmz` (node_helper.js:199-204) | partial — same ZIP-open shape, different entry-selection logic (do NOT reuse `kmzToKmlfilename`, see Anti-Pattern below) |
| `mpdHazardType` / `extractMpdField` (CDATA regex extraction) | `node_helper.js` | utility | transform | `_validTimeOfWinner` (node_helper.js:332-...) — "small targeted helper with JSDoc" convention | role-match (convention only, no direct code reuse) |
| `parseMpdValidEnd` (DDHHMM + IssueTime → UTC Date) | `node_helper.js` | utility | transform | none in this repo | no analog — copy RESEARCH.md Pattern 4 verbatim |
| SPC MD host-prefix fix (hostname match, https normalize) | `node_helper.js` | utility/validation | request-response | current `MD_HOST_PREFIX` check (node_helper.js:40, 446-450) | exact (same call site, logic must change) |
| Socket payload assembly (`advisories`, `winterImpact`, seq index move) | `node_helper.js` (`socketNotificationReceived`) | controller | request-response | `socketNotificationReceived` (node_helper.js:83-163), esp. lines 138-158 | exact (same function, shape changes) |
| `buildRequestPayload` (add `showWinterImpact`/`showMPD` toggles) | `MMM-SPCOutlook.js` | config/provider | request-response | `buildRequestPayload` (MMM-SPCOutlook.js:35-44) | exact |
| Frontend `socketNotificationReceived` (seq index move, drop `this.mds`) | `MMM-SPCOutlook.js` | controller | request-response | `socketNotificationReceived` (MMM-SPCOutlook.js:55-77) | exact |
| `getDom` WSSI render rows (Minor+ only) | `MMM-SPCOutlook.js` | component | transform | ERO render block (MMM-SPCOutlook.js:273-281) | exact |
| `getDom` single advisory band (source-prefixed, D-05) | `MMM-SPCOutlook.js` | component | transform | MD render block (MMM-SPCOutlook.js:210-214) | exact (loop shape identical; source needs to become `outlook.advisories.spcMD`/`.mpd`) |
| `getDom` no-risk short-circuit gate extension | `MMM-SPCOutlook.js` | component | transform | ERO extension of the gate (MMM-SPCOutlook.js:178-185) | exact |
| WSSI probe fixtures + scenarios (`wssi-*`) | `scripts/probe-payload-resilience.js` | test | batch | `ero-wellformed-slgt` (702-736), `ero-toggle-off` (738-756), `ERO_SLGT_BODY` fixture (98-107) | exact |
| MPD/SPC-MD probe fixtures + scenarios (`mpd-*`, `spc-md-*`) | `scripts/probe-payload-resilience.js` | test | batch | `installHttp` + `eroHttpRoutes` (283-310) as the `_fetch`-seam pattern; no `md-*`/`mpd-*` category exists yet | new territory, pattern borrowed from `installHttp` |
| Real KML-parsing libs in the probe harness | `scripts/probe-lib/module-stubs.js` | test/utility | file-I/O | `STUBS` object (103-111), `AdmZipStub`/`DOMParserStub`/`togeojsonStub` (83-97) | **conflict — see Shared Patterns / Open Gap below**, not a clean analog |

## Pattern Assignments

### `productRegistry.js` — `winterImpact` row

**Analog:** `PRODUCT_REGISTRY.excessiveRain` (productRegistry.js:9-78), verbatim template.

**Full existing row to mirror** (productRegistry.js:52-81):
```javascript
const eroDayLayers = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4 };
const eroDnToValue = { 1: 1, 2: 2, 3: 3, 4: 4 };
const eroValueToTier = { 0: "NONE", 1: "MRGL", 2: "SLGT", 3: "MDT", 4: "HIGH" };
const eroTierToText = { NONE: "None", MRGL: "Marginal", SLGT: "Slight", MDT: "Moderate", HIGH: "High" };
const eroTierToColor = { NONE: "afddf6", MRGL: "7ac687", SLGT: "f7f690", MDT: "eb7e82", HIGH: "ff81f8" };

const PRODUCT_REGISTRY = {
  excessiveRain: {
    id: "excessiveRain",
    configFlag: "showExcessiveRain",
    baseUrl: ERO_BASE_URL,
    dayLayers: eroDayLayers,
    days: 5,
    buildUrl: (day) => buildArcGisQuery(ERO_BASE_URL, eroDayLayers[day]),
    toValue: (label, f) => eroDnToValue[f.properties.dn] || 0,
    includesFeat: (label, val) => val > 0,
    valueToTier: eroValueToTier,
    tierToText: eroTierToText,
    tierToColor: eroTierToColor,
    validTimeField: "valid_time"
  }
};
```

**WSSI row to write** (values from RESEARCH.md's live-verified Code Examples — layer ids
1/2/3, field `impact`, ALL-CAPS domain, D-08 palette, D-09-AMENDED gate at MINOR):
```javascript
const WSSI_BASE_URL = "https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/wpc_wssi/MapServer";
const wssiDayLayers = { 1: 1, 2: 2, 3: 3 };   // 1-based, NOT 0-based like ERO
const wssiValueToTier = { 0: "NONE", 1: "WWA", 2: "MINOR", 3: "MODERATE", 4: "MAJOR", 5: "EXTREME" };
// WSSI-02: fold BEFORE lookup — raw field values are ALL CAPS regardless of WPC's mixed-case docs.
const wssiRawToValue = {
  "WINTER WEATHER AREA": 1, MINOR: 2, MODERATE: 3, MAJOR: 4, EXTREME: 5
};
const wssiTierToText = { NONE: "None", WWA: "Winter Weather Area", MINOR: "Minor",
                          MODERATE: "Moderate", MAJOR: "Major", EXTREME: "Extreme" };
// Hex, no leading "#" (matches eroTierToColor convention). Source cited per D-08:
// .../wpc_wssi/MapServer/1?f=json -> drawingInfo.renderer.uniqueValueInfos (RESEARCH.md Code Examples).
const wssiTierToColor = { NONE: "afddf6", WWA: "d2dfe7", MINOR: "faf5a3",
                           MODERATE: "f7962f", MAJOR: "e61f26", EXTREME: "7853a1" };

winterImpact: {
  id: "winterImpact",
  configFlag: "showWinterImpact",
  baseUrl: WSSI_BASE_URL,
  dayLayers: wssiDayLayers,
  days: 3,
  buildUrl: (day) => buildArcGisQuery(WSSI_BASE_URL, wssiDayLayers[day]),
  toValue: (label, f) => {
    const raw = f.properties.impact;
    const folded = typeof raw === "string" ? raw.trim().toUpperCase() : "";
    return wssiRawToValue[folded] || 0;
  },
  // D-09 AMENDED: MINOR (value 2) and above renders; WWA (value 1) and NONE (0) render nothing.
  includesFeat: (label, val) => val >= 2,
  valueToTier: wssiValueToTier,
  tierToText: wssiTierToText,
  tierToColor: wssiTierToColor,
  validTimeField: "valid_time"   // confirm exact field name against issue_time/valid_time schema in RESEARCH.md Code Examples
}
```
Note: `buildArcGisQuery` is untouched (D-01) — it already accepts any `mapservices.weather.noaa.gov`
baseUrl and any non-negative layerId, so `WSSI_BASE_URL` + `wssiDayLayers` pass its existing guards
unmodified.

---

### `node_helper.js` — WSSI day-loop

**Analog:** the ERO day-loop, in full (node_helper.js:1353-1428):
```javascript
const ero = PRODUCT_REGISTRY.excessiveRain;
const eroDays = ero.days;
const eroTiers = {};
const eroValidTimes = {};
for (let d = 1; d <= eroDays; d++) {
  eroTiers[d] = "NONE";
  eroValidTimes[d] = null;
}

if (productToggles[ero.configFlag]) {
  for (let d = 1; d <= eroDays; d++) {
    try {
      const url = ero.buildUrl(d);
      const fetchResult = await this.fetchGeoJsonCached(url);
      if (fetchResult.stale || fetchResult.failed) anyStale = true;

      let eroValue = 0;
      let eroValidTime = null;

      if (fetchResult.data === null && fetchResult.cachedResult !== null) {
        eroValue = fetchResult.cachedResult.value;
        eroValidTime = fetchResult.cachedResult.validTime;
      } else if (fetchResult.data !== null) {
        const polys = this.extractPolygons(fetchResult.data, ero.toValue, ero.includesFeat, url);
        eroValue = this.evaluatePolygons(polys, loc, catComparator);
        eroValidTime = eroValue > 0
          ? this._validTimeOfWinner(polys, loc, eroValue, ero.validTimeField)
          : null;
        this._geoJsonCache.set(url, {
          mode: fetchResult.mode,
          etag: fetchResult.newEtag ?? null,
          hash: fetchResult.newHash ?? null,
          result: { value: eroValue, validTime: eroValidTime },
          timestamp: Date.now()
        });
      }

      eroTiers[d] = ero.valueToTier[eroValue] || "NONE";
      eroValidTimes[d] = eroValidTime;
    } catch (eroErr) {
      Log.error(`MMM-SPCOutlook ${ero.id} day ${d}: fetch/parse/evaluate failed, leaving day at no risk`, eroErr);
    }
  }
}

const eroPayload = {};
for (let d = 1; d <= eroDays; d++) {
  eroPayload[`day${d}Risk`] = eroTiers[d];
  eroPayload[`day${d}Text`] = ero.tierToText[eroTiers[d]];
  eroPayload[`day${d}Color`] = ero.tierToColor[eroTiers[d]];
  eroPayload[`day${d}ValidTime`] = eroValidTimes[d];
}
```

**How to reuse for WSSI:** every line references `ero`/`eroDays`/`eroTiers` only through the
registry row — the block is already generic over `PRODUCT_REGISTRY.excessiveRain`. Copying it with
`ero` → `wssi` and `PRODUCT_REGISTRY.excessiveRain` → `PRODUCT_REGISTRY.winterImpact` reproduces
the identical fetch/cache/evaluate/valid-time machinery with zero new logic — `catComparator`,
`extractPolygons`, `evaluatePolygons`, `_validTimeOfWinner`, and `fetchGeoJsonCached`'s
ETag/staleness contract are all shared, untouched infrastructure. Add `winterImpact: wssiPayload`
to the `getSpcOutlook` return object (node_helper.js:1540, next to `excessiveRain: eroPayload`),
nested as `winterImpact: { day1: {...}, day2: {...}, day3: {...} }` per D-03's target shape (not
`day1Risk`-flattened like ERO — check exact nesting against D-03's `winterImpact: { day1..day3 }`
wording before implementing).

**Register the toggle:** no manual edit needed — `_productToggles()` (node_helper.js:74-80) already
iterates `Object.values(PRODUCT_REGISTRY)` and reads each row's own `configFlag`, so adding the
`winterImpact` row with `configFlag: "showWinterImpact"` is sufficient (WR-16's stated contract).

---

### `node_helper.js` — `kml-advisory` shared loop (generalizes `getMesoscaleDiscussion`)

**Analog:** `getMesoscaleDiscussion`, in full (node_helper.js:439-481):
```javascript
async getMesoscaleDiscussion(lat,lon){
  const ActiveURL = "https://www.spc.noaa.gov/products/md/ActiveMD.kmz"
  const ActiveKMZ = await this.fetchBinBuffer(ActiveURL);
  const ActiveKML = this.extractKmlFromKmz(ActiveKMZ, "ActiveMD.kml");
  const MDURLs = this.parseNetworkLinks(ActiveKML).filter((u) => {
    if (typeof u === "string" && u.startsWith(MD_HOST_PREFIX)) return true;
    Log.error("MMM-SPCOutlook: refusing off-host NetworkLink href " + JSON.stringify(u));
    return false;
  });
  if(MDURLs.length == 0) return false;
  const MDArray = [];
  for(const MDURL of MDURLs){
    try {
      const MDKMZ = await this.fetchBinBuffer(MDURL);
      const MDKML = this.extractKmlFromKmz(MDKMZ, this.kmzToKmlfilename(MDURL));
      const MDgj = this.kmlToGeoJson(MDKML);
      const hit = this.checkInPolygon(MDgj, lat, lon);
      const name = hit && hit.properties && hit.properties.name;
      if (name) {
        MDArray.push(name);
      } else if (hit) {
        Log.error("MMM-SPCOutlook: MD covers the location but carries no name: " + MDURL);
      }
    } catch (err) {
      Log.error("MMM-SPCOutlook: skipping unreadable MD " + MDURL, err);
    }
  }
  if (MDArray.length == 0) return false;
  return MDArray;
},
```

**Reusable structure (copy verbatim):**
- Per-candidate `try/catch` containment inside the loop (CR-02 lesson) — "one bad item must never
  discard its siblings." This does not change for MPD.
- `checkInPolygon` already returns the containing **feature** (not `features[0]`), so
  `hit.properties.name` works unchanged for SPC MD after migration (RESEARCH.md confirms SPC MD's
  Placemark `<name>` stays a clean label post-migration).
- `if (MDArray.length == 0) return false` / `false` sentinel for "no active advisories" — D-04
  reuses this exact "zero results is not staleness" semantics.

**What must change per D-02/D-03/MPD-02/MPD-04:**
- The function must become **per-row** (`discoverCandidates` supplied by the registry row), not
  hardcoded to `ActiveMD.kmz`, so `spcMD` and `mpd` share this loop body but not the URL/discovery
  logic. MPD-02 also requires collecting **every** containing feature, not stopping at the first
  `hit` from `checkInPolygon` if a single KMZ ever carries multiple polygons — verify against the
  live sample structure (RESEARCH.md: MPD KMZ is "single Polygon Placemark" per sample, so
  `checkInPolygon`'s single-feature return is likely sufficient per-candidate; the "collect ALL"
  requirement is across candidates, which the existing `MDArray.push` loop already does).
- Replace `this.kmzToKmlfilename(MDURL)` with the new `extractSoleKmlEntry` for MPD candidates
  (see Anti-Pattern below) — SPC MD's own `MD2108.kmz` → `MD2108.kml` naming still works with the
  existing heuristic, so either keep `kmzToKmlfilename` for spcMD's own discovery and
  `extractSoleKmlEntry` for mpd's, or standardize both onto `extractSoleKmlEntry` (RESEARCH.md
  recommends `extractSoleKmlEntry` as "the recommended shared primitive" for both).
- MPD candidates additionally need: (1) `mpdHazardType()` extraction from the description CDATA
  (D-06: log-and-render-without on parse miss, never drop), and (2) validity-window filtering via
  `parseMpdValidEnd` vs `now` (MPD-04) before a candidate is even added to the results array.

---

### `node_helper.js` — SPC MD host-prefix fix (Pitfall 1, part of the D-02 migration)

**Analog / current buggy code** (node_helper.js:40, 446-450):
```javascript
const MD_HOST_PREFIX = "https://www.spc.noaa.gov/";
// ...
const MDURLs = this.parseNetworkLinks(ActiveKML).filter((u) => {
  if (typeof u === "string" && u.startsWith(MD_HOST_PREFIX)) return true;
  Log.error("MMM-SPCOutlook: refusing off-host NetworkLink href " + JSON.stringify(u));
  return false;
});
```
**RESEARCH.md Pitfall 1:** the live `ActiveMD.kmz` index serves `http://www.spc.noaa.gov/...`
hrefs (not `https://`), so every live href fails `startsWith(MD_HOST_PREFIX)` today and SPC MD
silently reports zero results on every poll. Fix as part of the D-02 migration: match on hostname
only (accepting both `http:`/`https:` schemes) and normalize to `https://` before calling
`fetchBinBuffer`, so `redirect: "error"` does not throw on SPC's own 301. Keep the loud
`Log.error("refusing off-host...")` behavior for genuinely off-host hrefs — this is a security
control (V5 Input Validation / SSRF, RESEARCH.md Security Domain), not just a bug fix.

---

### `node_helper.js` — `extractSoleKmlEntry` (new) vs `extractKmlFromKmz`/`kmzToKmlfilename` (anti-pattern to avoid)

**Analog for the ZIP-open shape** (node_helper.js:193-204):
```javascript
kmzToKmlfilename(url) {
  const segments = url.split("/");
  const kmzFileName = segments[segments.length-1];
  return kmzFileName.slice(0,-1)+"l";
},

extractKmlFromKmz(buffer, filename){
  const ZIPper = new ZIP(buffer);
  const entry = ZIPper.getEntry(filename);
  if(!entry) throw new Error('KMZ downloaded has no KML');
  return ZIPper.readFile(entry).toString();
},
```
**Anti-pattern (RESEARCH.md, do not do this for MPD):** `kmzToKmlfilename` derives a `.kml` name
from the KMZ URL's last path segment (`MD2108.kmz` → `MD2108.kml`), which works for SPC MD but
computes `MPD_1118_final.kml` for MPD — a filename that does not exist; MPD's real member is a
fixed `doc.kml`.

**New primitive to add** (RESEARCH.md Pattern 2, live-verified against real `adm-zip`):
```javascript
function extractSoleKmlEntry(buffer) {
  const ZIPper = new ZIP(buffer);
  const kmlEntry = ZIPper.getEntries().find(e => /\.kml$/i.test(e.entryName));
  if (!kmlEntry) throw new Error("KMZ downloaded has no .kml entry");
  return ZIPper.readFile(kmlEntry).toString();
}
```
Same `new ZIP(buffer)` / `ZIPper.readFile(entry).toString()` shape as `extractKmlFromKmz` — only
the entry-selection strategy changes (`getEntries().find()` instead of `getEntry(filename)`).

---

### `node_helper.js` — MPD hazard-type extraction and validity window (no analog, copy from RESEARCH.md verbatim)

Both are net-new parsing helpers with no existing analog in this codebase, but RESEARCH.md
already live-verified them against real KMZ samples and they follow this project's own
"small, targeted, single-purpose helper" convention (cited precedent: `_validTimeOfWinner`,
node_helper.js:332-357, which is itself a JSDoc'd small helper reading one property off a winning
feature — same shape, different field).

```javascript
// RESEARCH.md Pattern 3 — description is { "@type": "html", "value": "..." }, NOT a plain string.
function extractMpdField(descriptionValue, label) {
  if (typeof descriptionValue !== "string") return null;
  const m = descriptionValue.match(
    new RegExp(`<td>${label}</td>\\s*<td>(.*?)</td>`, "s")
  );
  return m ? m[1].trim() : null;
}

function mpdHazardType(feature) {
  const desc = feature.properties && feature.properties.description;
  const html = desc && typeof desc === "object" ? desc.value : desc;
  return extractMpdField(html, "MPDType");
}
```
```javascript
// RESEARCH.md Pattern 4 — DDHHMM resolved against IssueTime's embedded date + US TZ abbreviation.
const TZ_OFFSET_HOURS = { EST: -5, EDT: -4, CST: -6, CDT: -5, MST: -7, MDT: -6, PST: -8, PDT: -7 };
function parseMpdValidEnd(issueTimeStr, validEndTi) {
  const m = issueTimeStr.match(/([A-Z]{2,4})\s+\w{3}\s+(\w{3})\s+(\d{1,2})\s+(\d{4})/);
  if (!m) return null;
  const [, tz, monthAbbr, , year] = m;
  const offset = TZ_OFFSET_HOURS[tz];
  if (offset === undefined) return null;
  const day = Number(validEndTi.slice(0, 2));
  const hour = Number(validEndTi.slice(2, 4));
  const minute = Number(validEndTi.slice(4, 6));
  const monthIdx = new Date(`${monthAbbr} 1, ${year}`).getMonth();
  const localDate = new Date(Date.UTC(Number(year), monthIdx, day, hour - offset, minute));
  return localDate;
}
```
D-06 requires: if `mpdHazardType()` returns `null` for an MPD the user is inside, render the MPD
without the hazard suffix and log the parse miss (mirror the existing "hit but no name" logging
shape at node_helper.js:471-473: `Log.error("MMM-SPCOutlook: MD covers the location but carries no
name: " + MDURL)`).

---

### `node_helper.js` — `socketNotificationReceived` (D-03 payload shape + seq index migration)

**Analog / current code** (node_helper.js:138-158):
```javascript
let md = false;
try {
  md = await this.getMesoscaleDiscussion(lat, lon);
} catch (err) {
  Log.error("MMM-SPCOutlook: mesoscale discussion fetch failed, continuing without MDs", err);
  md = false;
}
let outlook;
try {
  outlook = await this.getSpcOutlook(lat, lon, extended, productToggles);
} catch (err) {
  Log.error("MMM-SPCOutlook: outlook fetch failed", err);
  outlook = { error: err.toString() };
}
this._seq = (this._seq || 0) + 1;
this.sendSocketNotification("SPC_DATA_RESULT", [outlook, md, this._seq]);
```
**Target shape (D-03):** `advisories: { spcMD: [...], mpd: [...] }` moves **inside** `outlook`
(built by `getSpcOutlook`), and the standalone `md` socket element is retired:
```javascript
this._seq = (this._seq || 0) + 1;
this.sendSocketNotification("SPC_DATA_RESULT", [outlook, this._seq]);   // md removed; seq now index 1
```
**RESEARCH.md Pitfall 5 (MIGRATION HAZARD, HIGH priority):** the try/catch-and-degrade shape above
must be preserved (advisory fetch failure → `anyStale`, not a payload-killing throw — D-04), but
the try/catch's *destination* changes: instead of a separate `md` local passed as socket index 1,
the resolved `spcMD`/`mpd` arrays must be written into the same `outlook` object `getSpcOutlook`
returns, before `sendSocketNotification` is called. This is the single atomic change RESEARCH.md
flags most strongly — `node_helper.js`'s send-side and `MMM-SPCOutlook.js`'s
`socketNotificationReceived` read-side (`payload[1]` was `md`, becomes `seq`) must move in the same
task/commit, or CR-03's out-of-order-discard guarantee silently becomes a no-op with no error, no
log line, and no test failure unless a scenario specifically drives two out-of-order chains through
the real frontend post-migration.

---

### `MMM-SPCOutlook.js` — frontend `socketNotificationReceived` (seq index migration)

**Analog / current code** (MMM-SPCOutlook.js:55-77):
```javascript
socketNotificationReceived: function(notification, payload) {
  if (notification === "SPC_DATA_RESULT") {
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
```
**Change required:** `payload[2]` → `payload[1]` for `seq`; drop the `this.mds = payload[1]`
assignment entirely (advisories now live at `this.spcrisk.advisories.spcMD` /
`this.spcrisk.advisories.mpd`, read directly in `getDom` — no separate frontend field). Per Open
Question 3 / D-discretion, no compatibility shim: remove the `md` handling outright (no other
consumer exists in this single-instance deployment).

---

### `MMM-SPCOutlook.js` — `buildRequestPayload` (toggle wiring)

**Analog** (MMM-SPCOutlook.js:35-44):
```javascript
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
```
Add `showWinterImpact: this.config.showWinterImpact` and `showMPD: this.config.showMPD` (SPC MD's
migration into the registry does not need a new frontend toggle — MDs were always on; confirm
whether spcMD gets a `configFlag` at all or stays always-on per its pre-migration behavior) into
the `products` object, plus matching `defaults:` entries (mirroring `showExcessiveRain: false` at
MMM-SPCOutlook.js:8 — "every new product flag defaults to false").

---

### `MMM-SPCOutlook.js` — `getDom` WSSI render rows

**Analog** (MMM-SPCOutlook.js:273-281):
```javascript
if (this.config.showExcessiveRain && this.spcrisk.excessiveRain) {
  for (let d = 1; d <= 5; d++) {
    if (this.spcrisk.excessiveRain["day" + d + "Risk"] != "NONE") {
      wrapper.innerHTML += "Excessive Rain (Day " + d + "): <span style=\"color:#" +
        this.spcrisk.excessiveRain["day" + d + "Color"] + "\">" +
        this.spcrisk.excessiveRain["day" + d + "Text"] + "</span><br/>";
    }
  }
}
```
Same loop shape for WSSI, `d` bound to 3, and the `!= "NONE"` gate already matches D-09-AMENDED's
"MINOR and above renders, WWA and NONE render nothing" — as long as the registry's `tierToText`
map only ever assigns `"NONE"` for values 0 and 1 (WWA), this existing `!= "NONE"` check is
sufficient with no new gating logic (i.e., keep `wssiValueToTier[1] = "WWA"` distinct from
`"NONE"` internally for logging/telemetry, but suppress WWA from ever reaching this render block —
either by mapping WWA's tier string to `"NONE"` for display purposes, or adding an explicit
`!= "NONE" && != "WWA"` condition; Claude's Discretion per CONTEXT.md on exact row label wording).
Also extend the no-risk short-circuit gate (MMM-SPCOutlook.js:178-185, the ERO precedent) with an
equivalent `winterImpact` term.

**No-risk gate analog** (MMM-SPCOutlook.js:178-185):
```javascript
!(this.config.showExcessiveRain && this.spcrisk.excessiveRain && (
  this.spcrisk.excessiveRain.day1Risk != "NONE" ||
  this.spcrisk.excessiveRain.day2Risk != "NONE" ||
  this.spcrisk.excessiveRain.day3Risk != "NONE" ||
  this.spcrisk.excessiveRain.day4Risk != "NONE" ||
  this.spcrisk.excessiveRain.day5Risk != "NONE"
))
```

---

### `MMM-SPCOutlook.js` — `getDom` single advisory band (D-05)

**Analog** (MMM-SPCOutlook.js:210-214):
```javascript
if(this.mds) {
  for(const MD of this.mds){
    wrapper.innerHTML += "<span style=\"color: #0059E0\">" + escapeHtml(MD) + " in effect.</span><br/>"
  }
}
```
**escapeHtml, already defined above this block** (MMM-SPCOutlook.js:146-148):
```javascript
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (ch) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[ch]
));
```
**D-05 target rendering** — single loop, single colour, source-prefixed, MPDs hazard-suffixed:
```javascript
const advisories = this.spcrisk.advisories || { spcMD: [], mpd: [] };
for (const md of advisories.spcMD || []) {
  wrapper.innerHTML += "<span style=\"color: #0059E0\">SPC " + escapeHtml(md) + " in effect.</span><br/>";
}
for (const m of advisories.mpd || []) {
  const suffix = m.hazardType ? " — " + escapeHtml(m.hazardType) : "";
  wrapper.innerHTML += "<span style=\"color: #0059E0\">WPC MPD " + escapeHtml(m.number) + suffix + " in effect.</span><br/>";
}
```
(Exact string shape a Claude's-Discretion detail — D-05's CONTEXT.md example is
`"SPC MD 0123 in effect."` / `"WPC MPD 0456 — Heavy Rain in effect."`; both `md` (SPC MD's existing
`hit.properties.name`, which is already `"MD 2108"`-shaped per RESEARCH.md) and the MPD entry shape
(RESEARCH.md: build the label from the description table's `MPDNumber`, not the Placemark `name`,
which is a raw DTG string) must be assembled backend-side before reaching this render loop —
`escapeHtml` is mandatory on every remote-sourced string per the existing convention, since MPD's
`MPDType`/`MPDNumber` are equally unbounded remote text (RESEARCH.md Security Domain, V5).

---

### `scripts/probe-payload-resilience.js` — WSSI scenarios

**Analog: fixture shape** (ERO_SLGT_BODY, lines 96-107):
```javascript
const ERO_SLGT_BODY = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { dn: 2, valid_time: "2026-08-19T12:00:00Z" },
      geometry: { type: "Polygon", coordinates: [SAMPLE_RING] }
    }
  ]
};
```
WSSI fixtures follow the same shape with `properties.impact` (ALL-CAPS string) instead of `dn`:
```javascript
const WSSI_MINOR_BODY = {
  type: "FeatureCollection",
  features: [{ type: "Feature", properties: { impact: "MINOR", valid_time: "2026-08-19T12:00:00Z" },
               geometry: { type: "Polygon", coordinates: [SAMPLE_RING] } }]
};
// ...MODERATE/MAJOR/EXTREME analogous.
const WSSI_MIXED_CASE_BODY = {  // proves the case-fold is load-bearing (WSSI-02)
  type: "FeatureCollection",
  features: [{ type: "Feature", properties: { impact: "Minor" }, geometry: { type: "Polygon", coordinates: [SAMPLE_RING] } }]
};
const WSSI_EMPTY_FEATURES_BODY = EMPTY_FEATURE_COLLECTION;   // already defined at line 72, reuse directly
```

**Analog: scenario shape** (`ero-wellformed-slgt`, lines 702-736):
```javascript
{
  name: "ero-wellformed-slgt",
  run: async (helper) => {
    resetHelper(helper);
    resetLogs();
    helper._products = { showExcessiveRain: true };
    installFetch(helper, [
      [ERO_URLS[1], freshFetch(ERO_SLGT_BODY)]
    ]);
    const originalPointInPolygon = turfStub.pointInPolygon;
    turfStub.pointInPolygon = () => true;
    try {
      const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false);
      assertPayloadIntact(out);
      if (out.excessiveRain.day1Risk !== "SLGT") {
        throw new Error(`day1Risk expected SLGT, got ${out.excessiveRain.day1Risk}`);
      }
      // ...
    } finally {
      turfStub.pointInPolygon = originalPointInPolygon;
    }
  }
}
```
**Toggle-off analog** (`ero-toggle-off`, lines 738-756) — asserts the URL was never even called
when the config flag is off; copy verbatim with `showWinterImpact`/`WSSI_URLS`.

**Scenario names to add** (per RESEARCH.md's Validation Architecture section, already named):
`wssi-wellformed-minor`, `wssi-case-fold-mismatch-still-resolves`, `wssi-toggle-off`,
`wssi-zero-features-out-of-season`, `wssi-hard-fail-is-flagged`. `WSSI_URLS` object should mirror
`ERO_URLS` (lines 198-204), keyed off `PRODUCT_REGISTRY.winterImpact.buildUrl(day)` — never
hardcode the URL (PERF-02, D-09 precedent).

---

### `scripts/probe-payload-resilience.js` / `scripts/probe-lib/module-stubs.js` — MPD/SPC-MD scenarios (new territory)

**Analog for the HTTP-seam pattern** (`installHttp` + `eroHttpRoutes`, lines 283-310):
```javascript
function installHttp(helper, routes) {
  const calls = [];
  helper._fetch = async (url, options) => {
    calls.push({ url, headers: (options && options.headers) || {} });
    for (const [matcher, handler] of routes) {
      if (url.includes(matcher)) return handler(url, options);
    }
    return httpResponse({ status: 503, text: "service unavailable" });
  };
  helper._fetch.calls = calls;
  return helper._fetch;
}
```
MPD/SPC-MD scenarios route `fetchBinBuffer`'s KMZ fetches (and the MPD directory listing fetch)
through this same `_fetch` seam via `installHttp`, using `httpResponse({ status, body/text, etag })`
(lines 268-277) — **not** `installFetch` (which stubs `fetchGeoJsonCached`, the ArcGIS-shaped path;
irrelevant to KMZ fetches).

**Open Gap — flag for the planner, not a clean analog:** `scripts/probe-lib/module-stubs.js`'s
`STUBS` object (lines 103-111) currently makes `adm-zip`, `@xmldom/xmldom`, and `@tmcw/togeojson`
throw unconditionally (`AdmZipStub`/`DOMParserStub`/`togeojsonStub` = `inertThrow`, lines 83-97),
because the harness was built dependency-free ("executor git worktrees never carry an untracked
node_modules directory," module-stubs.js:1-10). **No `md-*`/`mpd-*` scenario exists today for
exactly this reason** — any code path through `extractKmlFromKmz`/`kmlToGeoJson`/`extractSoleKmlEntry`
would hit these throwing stubs immediately. RESEARCH.md's Validation Architecture section
explicitly recommends building synthetic KMZ buffers "in-memory with `adm-zip`" and driving the
real `fetchBinBuffer` through the `_fetch` seam — which requires the REAL `adm-zip` /
`@xmldom/xmldom` / `@tmcw/togeojson` to be available to `node_helper.js` inside the probe, not the
throwing stubs. This is a genuine tension the planner must resolve explicitly: either (a) swap
these three stubs for the real, already-installed libraries only for the kml-advisory-related
require paths (keep `node_helper`, `logger`, `@turf/turf` stubbed as today), or (b) keep the
zero-dependency posture and stub one layer higher (`extractKmlFromKmz`/`kmlToGeoJson` themselves)
with pre-built GeoJSON fixture objects instead of raw KMZ bytes — which would contradict WR-09's
explicit lesson ("stubbing too high a layer" hid real bugs) that this same file's own comments
warn against. RESEARCH.md's stated preference is (a).

---

## Shared Patterns

### Host allowlist + `redirect: "error"` (SSRF containment)
**Source:** `node_helper.js:40` (`MD_HOST_PREFIX`), `node_helper.js:184-191` (`fetchBinBuffer`),
`node_helper.js:28-30` (`buildArcGisQuery`'s own host guard).
**Apply to:** every new outbound fetch this phase adds — the WSSI MapServer host (already covered
by `buildArcGisQuery`'s existing `mapservices.weather.noaa.gov` guard, untouched), the MPD
directory listing (`www.wpc.ncep.noaa.gov`, new host to allowlist), and every per-candidate KMZ
fetch (both `spcMD` and `mpd`). `fetchBinBuffer` itself needs no change — it already carries
`redirect: "error"` and the 15s `withTimeout` abort; only the caller-supplied URL needs to pass an
allowlist check before `fetchBinBuffer` is invoked.
```javascript
async fetchBinBuffer(url){
  const res = await this._fetch(url, withTimeout({ redirect: "error" }));
  if(!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
},
```

### `escapeHtml` on every remote string reaching `innerHTML`
**Source:** `MMM-SPCOutlook.js:146-148`.
**Apply to:** the advisory band's SPC MD name, MPD number, and MPD hazard type — all three are
unbounded remote KML/CDATA text (RESEARCH.md Security Domain, V5/reflected-XSS pattern).

### Per-item containment (CR-02 lesson)
**Source:** `getMesoscaleDiscussion`'s per-MD `try/catch` (node_helper.js:461-477).
**Apply to:** the generalized `kml-advisory` loop for both `spcMD` and `mpd` candidates — one bad
KMZ (expired, malformed, missing name/hazard) must never discard its siblings. Same discipline
`extractPolygons` applies per-feature (node_helper.js:284-296) for the WSSI/ERO side.

### Registry-driven per-product toggle (WR-16, zero new wiring)
**Source:** `_productToggles()` (node_helper.js:74-80).
```javascript
_productToggles(products){
  const toggles = {};
  for (const row of Object.values(PRODUCT_REGISTRY)) {
    toggles[row.configFlag] = products?.[row.configFlag] === true;
  }
  return toggles;
},
```
**Apply to:** `winterImpact` (and `mpd`, if it gets a `configFlag`) — adding the row to
`PRODUCT_REGISTRY` is the only wiring needed; no manual edit to this function.

### Absence is silence (ERO-03, extended by D-09)
**Source:** ERO's `includesFeat: (label, val) => val > 0` (productRegistry.js:67) and the frontend's
`!= "NONE"` render gate (MMM-SPCOutlook.js:275).
**Apply to:** WSSI's `includesFeat: (label, val) => val >= 2` (MINOR and above only, per D-09
AMENDED) and MPD's "no covering feature → nothing rendered" (no explicit "None" row, ever).

### Stale vs. zero-results are different signals (D-04)
**Source:** the ERO day-loop's `if (fetchResult.stale || fetchResult.failed) anyStale = true;`
(node_helper.js:1367) contrasted with `getMesoscaleDiscussion`'s `false` "no active MDs" return
(node_helper.js:451, 479) which never touches `anyStale`.
**Apply to:** the generalized `kml-advisory` loop — a fetch failure on the index or a candidate KMZ
sets `anyStale`; a clean fetch that resolves to zero covering advisories does not.

## Conventions

Derived repo-wide via the shared deterministic module (`bin/gsd-tools.cjs verify conventions
--derive`), same tool `gsd-code-reviewer` uses. Sample is small (this is a two-file, ~2,500-line
module, not a large codebase), so most axes land as `insufficient-data` rather than a confident
dominant/contested read — treat the table as a weak prior, not a mandate, and prefer the concrete
excerpts above (which are drawn from the actual ERO/MD code this phase extends) wherever they
conflict.

| Axis | Dominant | Share | Entropy | Status |
|---|---|---|---|---|
| File-name casing | — | 0% | — | insufficient-data (5 files: 1 kebab-ish, 1 snake, 1 camel, 2 "other" — MMM-SPCOutlook.js and node_helper.js are MagicMirror-mandated names, not free choices) |
| Identifier casing | camel | 91% | 0.439 | named contract (20 camel / 2 Pascal of 22 sampled — `PRODUCT_REGISTRY`-style ALL_CAPS constants and `PascalCase` classes like `NodeHelper`/`ZIP` are the only non-camel exceptions) |
| Export style | cjs | 100%* | — | insufficient-data (only 3 exporting files sampled, all `module.exports`; no ESM anywhere in this repo) |
| Import style | — | 75% cjs / 25% esm | — | insufficient-data (4 samples; the one ESM import is `node_helper.js:2`'s dynamic `import('node-fetch')`, forced by `node-fetch`'s own ESM-only distribution — not a stylistic choice) |

**Contested hotspots (author's choice).** This repo has no genuinely contested axis at the scale
this tool usually flags (e.g. the gsd-plugin's own repo, where `bin/lib/**` is CJS
`module.exports`/`require` and `sdk/src/**` is ESM `export`/`import` — each half internally
consistent per-directory, contested only when compared repo-wide). MMM-SPCOutlook is uniformly CJS
except the one forced `node-fetch` ESM import. The precedent still applies structurally: when an
axis reads "insufficient-data" rather than a clean dominant, match the *nearest* existing file's
local style rather than importing a convention from elsewhere — e.g. new `node_helper.js` functions
follow `node_helper.js`'s own camelCase/`module.exports` shape, not some external "cleaner" style.
`PRODUCT_REGISTRY`-style `ALL_CAPS` stays reserved for genuinely constant, module-scope lookup
tables (`wssiRawToValue`, `wssiTierToColor`, etc. all correctly follow this in the Pattern
Assignments above).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `parseMpdValidEnd` (DDHHMM/timezone resolution) | utility | transform | No date/timezone parsing exists anywhere else in this codebase; copy RESEARCH.md Pattern 4 verbatim, it is already live-verified |
| MPD directory-listing discovery (Apache "Index of" HTML parse) | service | batch | No HTML-listing parser precedent; `parseNetworkLinks`'s DOM-select shape (node_helper.js:206-215) is XML/KML-specific and does not transfer directly — a regex over `<a href="...">` anchors plus the Last-Modified column is the recommended approach (RESEARCH.md "Don't Hand-Roll": avoid pulling in a general HTML parser for a bounded, single-purpose extraction) |
| Real KML-parsing libs inside `module-stubs.js`'s dependency-free harness | test/utility | file-I/O | Structural conflict between the harness's zero-dependency design goal and RESEARCH.md's recommendation to drive real `adm-zip`/`@xmldom/xmldom`/`@tmcw/togeojson` for MPD/SPC-MD scenarios — see the Open Gap note under Pattern Assignments; this needs an explicit planning decision, not a silent choice |

## Metadata

**Analog search scope:** `productRegistry.js`, `node_helper.js`, `MMM-SPCOutlook.js`,
`scripts/probe-payload-resilience.js`, `scripts/probe-lib/module-stubs.js` (the full set named in
15-CONTEXT.md's canonical refs / code section)
**Files scanned:** 5 (all read in full or via targeted, non-overlapping ranges; no file re-read)
**Pattern extraction date:** 2026-08-23
