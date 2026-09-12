# Phase 15: WPC Winter Storm Severity & Mesoscale Precipitation Discussion - Research

**Researched:** 2026-08-23 / 2026-08-24
**Domain:** NOAA/WPC ArcGIS MapServer (WSSI) + NOAA/WPC KML/KMZ advisory feed (MPD), integrated into an
existing Node.js MagicMirror backend/frontend pair
**Confidence:** HIGH — every claim below marked `[VERIFIED: live fetch]` was obtained by directly
querying the real, production NOAA/WPC endpoints during this research session (2026-08-23/24,
off-season for winter weather, active for MPDs), not from documentation or training data.

## Summary

Both products slot cleanly into the D-01 registry shape, but they are NOT symmetric. **WSSI is a
second `arcgis-day-layers` row and is almost a copy-paste of the `excessiveRain` row** — same
MapServer host, same `f=geojson`/`buildArcGisQuery` mechanics, same "day-indexed layer → dn/impact
field → tier" shape, three days instead of five. Its ONLY new wrinkle is that the impact field's
raw values are literally ALL CAPS in the live renderer definition (`"MINOR"`, `"MODERATE"`,
`"MAJOR"`, `"EXTREME"`, plus `"WINTER WEATHER AREA"`) while WPC's public documentation writes them
in mixed case — confirmed directly from the layer's own `drawingInfo.renderer.uniqueValueInfos`,
which is the ground truth for what raw feature values actually look like. **Critically, WPC's real
value domain has no "Limited" tier at all** — the lowest genuine impact level is `MINOR`, and
`WINTER WEATHER AREA` is WPC's own non-impact placeholder tier (its service description explicitly
states it is "not anticipated to impact daily life"). D-09's "Limited and above renders a row"
language must be re-mapped to this real domain; see Open Question 1.

**MPD is structurally a different animal from both ERO/WSSI and from the SPC MD it is being paired
with.** There is no WPC-published `ActiveMD.kmz`-equivalent index — the only discovery mechanism is
a plain Apache directory listing at `https://www.wpc.ncep.noaa.gov/kml/mpd/` containing every MPD
ever issued this year (1000+ entries) plus a `2025/` (and presumably older) archive subfolder. **A
live, currently-reproducible example of MPD-04's exact failure mode was captured during this
research**: `MPD_1281_final.kmz` sits in the *current* live directory (unarchived) but its own
embedded `IssueTime` field reads "502 AM EST Sun Dec 28 2025" — six months stale — while
`MPD_1118_final.kmz`, issued today, carries a *lower* number. Sorting by filename number and taking
the max would silently select the year-old discussion. Each individual MPD KMZ carries its own
absolute-ish validity window (`ValidStart`/`ValidEndTi`, DDHHMM format, resolved against
`IssueTime`'s full date+timezone), which is the only reliable source of truth for "is this MPD still
active" — never the number.

MPD's hazard type (MPD-03) lives inside an HTML `<table>` embedded in the Placemark's
`<description>` CDATA — a `<td>MPDType</td><td>Heavy rainfall, Flash flooding possible</td>` row
pair, confirmed present in 9/9 live samples pulled across the current MPD number range. The KML
member filename inside the KMZ is a **fixed `doc.kml`**, not derived from the KMZ URL the way SPC
MD's `MD2108.kmz` → `MD2108.kml` heuristic works — `kmzToKmlfilename` cannot be reused verbatim for
MPD; a "find the sole `.kml` zip entry" approach works for both product types and is the
recommended shared primitive.

**A live, currently-shipping defect was also found and must be accounted for in planning**: SPC's
own `ActiveMD.kmz` index currently publishes member hrefs as plain `http://www.spc.noaa.gov/...`
(not `https://`), while `node_helper.js:40`'s Phase 14 WR-06 fix hardcodes
`MD_HOST_PREFIX = "https://www.spc.noaa.gov/"`. Every live href therefore fails the
`startsWith(MD_HOST_PREFIX)` check today, silently zeroing SPC MD results on every poll. D-02's
migration is the natural place to fix this (match on hostname, not full scheme+host, and normalize
to `https://` before fetching so `redirect: "error"` does not throw on the 301 SPC itself serves).

**Primary recommendation:** Add `winterImpact` as a straightforward second `arcgis-day-layers`
registry row (days: 3, field: `impact`, case-folded lookup). Add a new `kml-advisory` kind whose
shared machinery is fetch→zip→sole-`.kml`-entry→geojson→per-feature containment (no
tier/comparator logic — MPD-02 requires *every* covering feature, not a "winning" one), but give
each `kml-advisory` row its own `discoverCandidates()` function, because SPC MD's index-based
discovery and MPD's directory-listing-plus-validity-window discovery are genuinely different
mechanisms sharing only the downstream pipeline. Fix the SPC MD scheme-allowlist defect as part of
the migration, not after it.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Widen `PRODUCT_REGISTRY` with a **`kind` per row**. Two kinds this phase:
  `"arcgis-day-layers"` (ERO, WSSI) and `"kml-advisory"` (SPC MD, WPC MPD). `buildArcGisQuery`
  is untouched and stays non-overridable per Phase 14 D-09 — it simply becomes what the
  `arcgis-day-layers` kind uses.
- **D-02:** **Migrate SPC Mesoscale Discussions into the registry** as a `kml-advisory` row
  alongside WPC MPD, so both advisory products share one fetch path, one containment helper, and
  one host allowlist. SPC categorical/probabilistic and fire-weather layers stay OUT (Phase 14's
  D-08 continues to govern those).
- **D-03:** Advisories move **inside the outlook payload** as `advisories: { spcMD: [...], mpd:
  [...] }`. The separate `md` socket element is retired. Target shape:
  ```
  socket: [outlook, seq]          // md element retired
  outlook = {
    day1..day8, fireWeather, excessiveRain,
    winterImpact: { day1..day3 },
    advisories: { spcMD: [...], mpd: [...] },
    _stale, _staleAsOf
  }
  ```
- **D-04:** An advisory **fetch failure** rolls into the global `anyStale` flag. A **successful
  fetch returning zero advisories does not**. Per-product staleness UX stays deferred.
- **D-05:** **One advisory band**, each entry prefixed with its issuing source, MPDs suffixed with
  hazard type:
  ```
  SPC MD 0123 in effect.
  WPC MPD 0456 — Heavy Rain in effect.
  ```
  Single loop, single colour.
- **D-06:** If MPD-03's description-CDATA parse yields **no hazard type** for an MPD the user is
  inside, render the MPD **without** the hazard type and log the parse miss. Never drop it.
- **D-07:** **No cap** on the advisory band; render every concurrently active MPD per MPD-02.
- **D-08:** WSSI impact colours come from **WPC's own published renderer** (the WSSI layer's
  MapServer legend / `drawingInfo`), with the **source URL recorded in the registry row**.
- **D-09:** **Limited and above renders a row.** `None` and no-polygon render nothing (see Open
  Question 1 — WPC's real domain has no literal "Limited" value).
- **D-10:** Phase 15 is verified by **probe scenarios plus live MPD UAT**, not by live WSSI UAT.
  Extend the probe suite with WSSI fixtures covering each impact level, the ALL-CAPS vs mixed-case
  mismatch (WSSI-02), and the zero-feature out-of-season path (WSSI-03). Every new scenario must be
  mutation-proven. Verify MPD against live data if any fire during the phase. Live WSSI confirmation
  is deferred in-season.

### Claude's Discretion

- **MPD-04 tie-break** — researcher must establish what WPC actually publishes before planning
  locks this. **Answered by this research**: no active-index exists; see Summary and Open Question
  2 for the recommended two-layer discovery/validity mechanism.
- WSSI-02 case normalisation mechanism (where and how the ALL-CAPS fold happens).
- Exact row label wording for WSSI rows (e.g. "Winter Impact (Day 1): Moderate").
- Where the `kind` dispatch physically lives, and whether it is a switch, a per-kind handler map,
  or per-row function references.
- Whether the retired `md` socket element leaves a compatibility shim or is removed outright.

### Deferred Ideas (OUT OF SCOPE)

- Backfill ERO's palette citation (IN-01) — not bundled into this phase.
- Migrating fire-weather and SPC categorical/probabilistic layers into the registry — declined,
  D-08's scope limit holds.
- Per-product staleness UX — would reopen Phase 14's D-04 a phase early. Revisit no earlier than
  Phase 18.
- Collapsing a long advisory band ("+3 more in effect") — declined per D-07.
- Live in-season WSSI verification — deferred by D-10, following the v1.1 fire-weather precedent.
- WSSI 5-component breakdown (WSSIX-01) — deferred to v2.x.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-------------------|
| WSSI-01 | User sees WSSI Overall Impact for Days 1-3 when `showWinterImpact` is enabled | Live-confirmed layer IDs 1/2/3 = `Overall_Impact_Day_1/2/3` on `outlooks/wpc_wssi/MapServer`; `days: 3` registry row mirrors `excessiveRain` exactly |
| WSSI-02 | Correct impact labels regardless of the field's letter case | Live-confirmed via `drawingInfo.renderer.uniqueValueInfos`: raw values are `WINTER WEATHER AREA`/`MINOR`/`MODERATE`/`MAJOR`/`EXTREME` (all caps); field name itself is lowercase `impact` |
| WSSI-03 | No winter rows, no error, when WSSI returns zero features out of season | Live-confirmed: querying layer 1/2/3 today (off-season) returns `{"type":"FeatureCollection","features":[]}` — structurally identical to ERO's already-handled empty-day shape |
| MPD-01 | Indicator when location is inside an active MPD, `showMPD` enabled | Live KMZ sample (`MPD_1118_final.kmz`) fully decoded: single Polygon Placemark, containment via existing `checkInPolygon`/turf machinery |
| MPD-02 | ALL concurrently active MPDs shown, not just most recent | No active-index exists; recommended directory-listing + per-file validity-window discovery returns every currently-valid MPD, independent of number |
| MPD-03 | Hazard type from description CDATA | Live-confirmed HTML-table field `MPDType` inside CDATA, present in 9/9 sampled MPDs; togeojson wraps description as `{ "@type": "html", "value": "<html>..." }`, not a plain string — must read `.value` |
| MPD-04 | Correct selection across year boundary | Live-reproduced failure case: `MPD_1281_final.kmz` (issued 2025-12-28) sits unarchived in the current directory alongside `MPD_1118` (issued 2026-08-23); number-sorting picks the wrong one. `ValidStart`/`ValidEndTi`/`IssueTime` fields provide the real answer |

</phase_requirements>

## Architectural Responsibility Map

This project has a two-process topology (MagicMirror frontend module + its `node_helper.js`
backend companion), not a web-tiered one. Tiers are named accordingly.

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| WSSI fetch, cache, tier resolution | Backend (`node_helper.js`) | — | Same `arcgis-day-layers` machinery as ERO; no new tier needed |
| WSSI impact case-folding | Backend (`node_helper.js`), inside the registry row's `toValue` | — | Must happen before the tier lookup, exactly where ERO's `dn` mapping happens — never in the frontend |
| MPD/SPC-MD candidate discovery | Backend (`node_helper.js`) | — | Requires an outbound network fetch (directory listing or index KML); cannot live in the registry's static config |
| MPD/SPC-MD containment + hazard-type extraction | Backend (`node_helper.js`) | — | Requires per-user-location geometry math (turf), which only runs backend-side today |
| Advisory band rendering (single loop, source-prefixed) | Frontend (`MMM-SPCOutlook.js` `getDom`) | — | Pure presentation of an already-resolved `advisories` array; mirrors the existing `this.mds` render block |
| Socket payload assembly (`advisories: {spcMD, mpd}`, `winterImpact`) | Backend (`node_helper.js`, `getSpcOutlook`) | Frontend (socket read site) | D-03's shape change is a backend-authored contract; frontend only consumes it — but BOTH ends of the `[outlook, seq]` index change must move together (see Pitfall: Socket Index Migration) |

## Standard Stack

No new external packages are required. This phase reuses the exact dependency set already
installed and used by Phase 14's ERO row and the pre-existing SPC MD path:

### Core (already in `package.json`, unchanged)
| Library | Version (installed) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@turf/turf` | ^7.2.0 [VERIFIED: package.json] | Point-in-polygon, geometry ops | Already the sole geometry engine for ERO and SPC MD |
| `@xmldom/xmldom` | ^0.9.8 [VERIFIED: package.json] | KML text → DOM | Already used by `kmlToGeoJson`/`parseNetworkLinks` |
| `@tmcw/togeojson` | ^7.1.0 [VERIFIED: package.json] | KML DOM → GeoJSON | Already used for MD conversion; confirmed live in this session (see Code Examples) to wrap `description` as `{ "@type": "html", "value": "..." }`, not a plain string |
| `adm-zip` | ^0.5.16 [VERIFIED: package.json] | KMZ (zip) extraction | Already used for `extractKmlFromKmz` |
| `node-fetch` | ^2.6.1 [VERIFIED: package.json] | HTTP transport | Already the sole transport, routed through the `_fetch(url, options)` seam |

### Supporting
None new. WSSI reuses `buildArcGisQuery`. MPD/SPC-MD reuse `fetchBinBuffer` + the KMZ pipeline.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Regex-based HTML-table field extraction for MPD's `MPDType`/`ValidStart`/`ValidEndTi` | Re-parsing the CDATA `description.value` with `@xmldom/xmldom` as a second, nested XML document | The description HTML in the live samples is well-formed XHTML-ish and *could* be DOM-parsed, but a regex over `<td>LABEL</td>\s*<td>(.*?)</td>` is simpler, has no new failure surface, and matches this project's existing "small, targeted parsing helper" convention (`_validTimeOfWinner`, `parseNetworkLinks`) — recommended |
| Directory-listing + per-file validity-window discovery for MPD | Naive number-sort ("fetch the last N filenames, take the highest") | Number-sort is exactly the MPD-04 failure mode this phase exists to prevent — live-reproduced in this session (see Pitfall) |

**Installation:** none required — no `npm install` needed for this phase.

## Package Legitimacy Audit

Not applicable — this phase installs no new external packages. All required functionality is
already provided by the five dependencies listed above, already present in `package.json` and
`node_modules/` and already exercised by Phase 14's shipped code.

## Architecture Patterns

### System Architecture Diagram

```
                     ┌─────────────────────────────────────────────────────┐
                     │            node_helper.js (backend)                  │
                     │                                                       │
  GET_SPC_DATA ─────▶│  socketNotificationReceived                          │
  { lat, lon,        │        │                                             │
    products }       │        ├─▶ getSpcOutlook(lat, lon, extended, tog)    │
                     │        │        │                                    │
                     │        │        ├─▶ [existing] day1-8, fireWeather   │
                     │        │        │                                    │
                     │        │        ├─▶ [existing, ARCGIS-DAY-LAYERS]    │
                     │        │        │   excessiveRain (ERO row)          │
                     │        │        │                                    │
                     │        │        ├─▶ [NEW, ARCGIS-DAY-LAYERS]         │
                     │        │        │   winterImpact (WSSI row)          │
                     │        │        │     buildArcGisQuery(WSSI, 1..3)   │
                     │        │        │       ──▶ mapservices.weather      │
                     │        │        │            .noaa.gov (WSSI Map-    │
                     │        │        │            Server, layers 1/2/3)   │
                     │        │        │     toValue: fold `impact` (ALL    │
                     │        │        │       CAPS) → tier                 │
                     │        │        │                                    │
                     │        │        └─▶ [NEW, KML-ADVISORY kind]         │
                     │        │            for each advisory row            │
                     │        │            (spcMD, mpd):                    │
                     │        │              row.discoverCandidates()       │
                     │        │                ├─ spcMD: fetch              │
                     │        │                │   ActiveMD.kmz (real       │
                     │        │                │   index) → NetworkLink     │
                     │        │                │   hrefs (host-normalized   │
                     │        │                │   to https)                │
                     │        │                └─ mpd: fetch /kml/mpd/      │
                     │        │                    dir listing → filter by  │
                     │        │                    Last-Modified recency    │
                     │        │              for each candidate URL:        │
                     │        │                fetchBinBuffer (allowlisted, │
                     │        │                redirect:"error")            │
                     │        │                → sole .kml zip entry        │
                     │        │                → kmlToGeoJson               │
                     │        │                → per-feature containment    │
                     │        │                → (mpd only) parse ValidEndTi│
                     │        │                  vs now; drop if expired    │
                     │        │                → (mpd only) parse MPDType   │
                     │        │                  from description CDATA     │
                     │        │              collect ALL contained, still-  │
                     │        │              valid features (no "winner")   │
                     │        │                                             │
                     │        └─▶ outlook = { ...existing, winterImpact,    │
                     │                        advisories: {spcMD, mpd},     │
                     │                        _stale, _staleAsOf }          │
                     │                                                      │
  SPC_DATA_RESULT ◀──┤  sendSocketNotification("SPC_DATA_RESULT",           │
  [outlook, seq]     │    [outlook, this._seq])   // `md` element retired   │
                     └──────────────────────────────────────────────────────┘
                                          │
                                          ▼
                     ┌─────────────────────────────────────────────────────┐
                     │         MMM-SPCOutlook.js (frontend, getDom)         │
                     │  socketNotificationReceived reads payload[1] as seq  │
                     │  (was payload[2]) — MUST move together with backend │
                     │                                                      │
                     │  render: day1-8 rows, fireWeather rows,             │
                     │  excessiveRain rows, [NEW] winterImpact rows        │
                     │  (Minor+ only, mapped color from D-08 palette),     │
                     │  [NEW] single advisory band: for each entry in      │
                     │  outlook.advisories.spcMD then .mpd (or interleaved │
                     │  per D-05's single loop):                           │
                     │    "SPC MD 0123 in effect."                         │
                     │    "WPC MPD 0456 — Heavy Rain in effect."           │
                     └──────────────────────────────────────────────────────┘
```

### Recommended Project Structure

No new files are structurally required — `productRegistry.js` already holds `PRODUCT_REGISTRY`
and `buildArcGisQuery`; this phase adds:

```
productRegistry.js
├── PRODUCT_REGISTRY.excessiveRain      # existing, unchanged
├── PRODUCT_REGISTRY.winterImpact       # NEW — arcgis-day-layers kind, mirrors excessiveRain
├── PRODUCT_REGISTRY.spcMD              # NEW — kml-advisory kind, migrated from node_helper.js
└── PRODUCT_REGISTRY.mpd                # NEW — kml-advisory kind

node_helper.js
├── (existing ERO loop, generalized or duplicated for winterImpact — planner's call)
└── (existing getMesoscaleDiscussion logic, generalized into a kml-advisory loop shared by
     spcMD and mpd rows, each supplying its own discoverCandidates())
```

### Pattern 1: ArcGIS "kind" — WSSI as ERO's twin

**What:** A day-indexed ArcGIS MapServer product whose raw impact field needs a case-insensitive
value lookup.
**When to use:** Any WPC/CPC product exposed as day-numbered ArcGIS feature layers with a
`uniqueValue` renderer field (WSSI today; the same shape likely recurs for Phase 16/17 candidates).
**Example (verified live 2026-08-24):**
```javascript
// Source: live query against mapservices.weather.noaa.gov, this research session
// GET https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/wpc_wssi/MapServer?f=json
// layers[1..3] = { id: 1, name: "Overall_Impact_Day_1" }, id:2 → Day_2, id:3 → Day_3
// field name (lowercase): "impact"
// raw value domain (ALL CAPS, confirmed via drawingInfo.renderer.uniqueValueInfos):
//   "WINTER WEATHER AREA", "MINOR", "MODERATE", "MAJOR", "EXTREME"

const WSSI_BASE_URL = "https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/wpc_wssi/MapServer";
const wssiDayLayers = { 1: 1, 2: 2, 3: 3 };   // NOTE: layer ids start at 1, unlike ERO's 0-based days

// WSSI-02: fold case before lookup — the live renderer proves the raw field is ALL CAPS
// regardless of WPC's mixed-case prose documentation.
const wssiValueToTier = {
  "WINTER WEATHER AREA": "WWA", MINOR: "MINOR", MODERATE: "MODERATE",
  MAJOR: "MAJOR", EXTREME: "EXTREME"
};
const wssiToValue = (label, f) => {
  const raw = f.properties.impact;
  const folded = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  return wssiValueToTier[folded] || "NONE";
};
```

### Pattern 2: `kml-advisory` — shared pipeline, per-row discovery

**What:** Fetch a KMZ (or set of KMZs) not tied to a single static URL, extract the sole `.kml`
zip entry (name varies by product — do not hardcode), convert to GeoJSON, test containment for
EVERY covering feature (not a "winning" one), and — for MPD only — extract a hazard type from the
description CDATA and check the feature's own embedded validity window.
**When to use:** SPC MD, WPC MPD this phase; any future advisory-shaped (non-tiered) WPC/CPC
product.
**Example (verified live 2026-08-24, real KMZ member names):**
```javascript
// Source: live unzip of MPD_1118_final.kmz and MD2108.kmz, this research session
// MPD KMZ contents: [ "<hash>.xsl", "doc.kml" ]   <- fixed name "doc.kml", NOT URL-derived
// SPC MD KMZ contents: [ "MD2108.kml" ]            <- URL-derived name (existing heuristic works)
// Recommended shared primitive — do not reuse kmzToKmlfilename for the kml-advisory kind:
function extractSoleKmlEntry(buffer) {
  const ZIPper = new ZIP(buffer);
  const kmlEntry = ZIPper.getEntries().find(e => /\.kml$/i.test(e.entryName));
  if (!kmlEntry) throw new Error("KMZ downloaded has no .kml entry");
  return ZIPper.readFile(kmlEntry).toString();
}
```

### Pattern 3: MPD hazard-type extraction from description CDATA

**What:** `@tmcw/togeojson` wraps a KML `<description>` CDATA block as an object, not a string.
**Example (verified live, real feature from `MPD_1118_final.kmz`):**
```javascript
// Source: node -e run against a real, live-downloaded MPD KMZ, this research session.
// KMLtoGJ.kml(doc).features[0].properties.description is:
//   { "@type": "html", "value": "<html>...<td>MPDType</td>\n\n<td>Heavy rainfall, ...</td>..." }
// NOT a plain string — reading properties.description directly and regexing it fails silently
// (no match, hazard type falls through to D-06's "no hazard type" branch on every MPD).

function extractMpdField(descriptionValue, label) {
  if (typeof descriptionValue !== "string") return null;
  // Live samples separate <td>LABEL</td> from its value <td> by whitespace/newlines only —
  // .*? with the /s flag survives that.
  const m = descriptionValue.match(
    new RegExp(`<td>${label}</td>\\s*<td>(.*?)</td>`, "s")
  );
  return m ? m[1].trim() : null;
}

function mpdHazardType(feature) {
  const desc = feature.properties && feature.properties.description;
  const html = desc && typeof desc === "object" ? desc.value : desc;
  return extractMpdField(html, "MPDType");   // e.g. "Heavy rainfall, Flash flooding possible"
}
```

### Pattern 4: MPD validity window — DDHHMM resolved against IssueTime

**What:** `ValidEndTi` (note: truncated field name, verified verbatim across all live samples — it
is NOT `ValidEndTime`) is a bare `DDHHMM` string with no month/year; `IssueTime` carries the full
date and a US timezone abbreviation. Native `Date` parsing of `IssueTime` fails (verified: `new
Date("734 PM EDT Sun Aug 23 2026")` → `Invalid Date`).
**Example:**
```javascript
// Source: live samples, this research session. All 9 samples pulled had IssueTime in one of
// EDT/EST (all sampled WFOs were eastern-half offices this session — MDT/CDT/PDT etc. are
// documented WPC conventions but NOT independently confirmed live this session; see Assumptions Log).
const TZ_OFFSET_HOURS = { EST: -5, EDT: -4, CST: -6, CDT: -5, MST: -7, MDT: -6, PST: -8, PDT: -7 };

function parseMpdValidEnd(issueTimeStr, validEndTi) {
  // issueTimeStr e.g. "734 PM EDT Sun Aug 23 2026"; validEndTi e.g. "240515" (DD HH MM)
  const m = issueTimeStr.match(/([A-Z]{2,4})\s+\w{3}\s+(\w{3})\s+(\d{1,2})\s+(\d{4})/);
  if (!m) return null;
  const [, tz, monthAbbr, , year] = m;
  const offset = TZ_OFFSET_HOURS[tz];
  if (offset === undefined) return null;
  const day = Number(validEndTi.slice(0, 2));
  const hour = Number(validEndTi.slice(2, 4));
  const minute = Number(validEndTi.slice(4, 6));
  // Construct in the issuing office's local time, then convert to UTC by subtracting offset.
  // Roll to next month if the end-day is less than the issue-day (end after midnight next day
  // near month boundary) — not exercised live this session; flag as an edge case for the probe.
  const monthIdx = new Date(`${monthAbbr} 1, ${year}`).getMonth();
  const localDate = new Date(Date.UTC(Number(year), monthIdx, day, hour - offset, minute));
  return localDate;   // a UTC Date; compare against `new Date()`
}
```

### Anti-Patterns to Avoid

- **Sorting MPD filenames numerically and taking the max:** live-reproduced failure this session
  (`MPD_1281` > `MPD_1118` numerically, but `MPD_1281` is 6 months stale). Never do this.
- **Reusing `kmzToKmlfilename` for MPD:** it derives `doc.kml`-shaped names from the URL's last
  segment, which for `MPD_1118_final.kmz` would compute `MPD_1118_final.kml` — a filename that
  does not exist in the archive (the real member is `doc.kml`). Use `extractSoleKmlEntry` instead
  for the `kml-advisory` kind.
- **Treating `feature.properties.description` as a string:** it is `{ "@type": "html", "value":
  "..." }` from `@tmcw/togeojson`. Always unwrap `.value` first.
- **Reusing `evaluatePolygons`'s "winning tier" comparator logic for MPD/SPC MD:** MPD-02 requires
  every covering advisory, not the single best one. The `kml-advisory` kind needs a "collect all
  contained features" loop, not `evaluatePolygons`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| KML → GeoJSON conversion | A custom XML walker for `<Placemark>`/`<Polygon>`/`<MultiGeometry>` | `@tmcw/togeojson` (already a dependency) | Already battle-tested by the existing SPC MD path; handles `MultiGeometry` unwrapping (verified live: a single-Polygon `MultiGeometry` collapses to a plain `Polygon` feature) |
| Point-in-polygon | Custom ray-casting | `turf.booleanPointInPolygon` (already used everywhere) | Already the sole geometry primitive in this codebase; no reason to diverge for two more rows |
| US timezone abbreviation → UTC offset | A generic timezone library (`moment-timezone`, `luxon`) | An 8-entry static object (EST/EDT/CST/CDT/MST/MDT/PST/PDT) | WPC's `IssueTime` domain is bounded to the ~8 CONUS zone abbreviations WFOs use; a full timezone library is disproportionate weight for a Raspberry Pi module whose core value statement explicitly calls out "no unnecessary CPU burn on the RPi" |

**Key insight:** every piece of this phase's new parsing work (case-fold, DDHHMM/timezone
resolution, HTML-table field extraction) is small, targeted, and mirrors the project's existing
convention of narrow single-purpose helpers (`_validTimeOfWinner`, `parseNetworkLinks`,
`kmzToKmlfilename`) rather than pulling in a general-purpose library for a narrow, bounded problem.

## Runtime State Inventory

This phase is flagged by D-03 as containing a "MIGRATION HAZARD" (the socket payload shape and the
`md` element retirement), so this section is included even though the project has almost no
external persisted state to migrate.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — `_geoJsonCache` is an in-memory `Map`, reset on process restart; nothing is written to disk or an external database | None |
| Live service config | None — no external service (n8n, Datadog, etc.) stores configuration keyed by this module's field names | None |
| OS-registered state | None — MagicMirror module, no OS-level task/service registration | None |
| Secrets/env vars | None — this module reads no secrets; all endpoints are public NOAA/WPC services | None |
| Build artifacts | None — no compiled/installed package carries the renamed `md` socket field | None |

**The one genuine migration hazard is a wire-protocol/code change, not external state**: the socket
array index of `seq` moves from `payload[2]` to `payload[1]` when the `md` element is retired
(D-03). This is covered in detail under Common Pitfalls (Socket Index Migration) — both
`node_helper.js`'s `sendSocketNotification` call and `MMM-SPCOutlook.js`'s
`socketNotificationReceived` destructuring **must change in the same commit/task**, never
sequentially, or the frontend silently stops discarding late payloads (loses CR-03's protection).

## Common Pitfalls

### Pitfall 1: SPC MD's own index currently serves `http://`, not `https://` — the Phase 14 WR-06 allowlist rejects every live href today

**What goes wrong:** `getMesoscaleDiscussion` currently returns `false` (reports "no active MDs")
on every single poll in production, even when MDs are genuinely active.
**Why it happens:** `MD_HOST_PREFIX = "https://www.spc.noaa.gov/"` (node_helper.js:40) is an exact
string prefix match. Live-fetched `ActiveMD.kmz` today (2026-08-24, 3 active MDs observed) serves
`<href>http://www.spc.noaa.gov/products/md/MD2108.kmz</href>` — plain HTTP, which then 301-redirects
to HTTPS. `"http://...".startsWith("https://...")` is `false`, so `parseNetworkLinks`'s filter logs
`"refusing off-host NetworkLink href"` for every candidate and `MDURLs.length` is always 0.
**How to avoid:** When migrating SPC MD into the `kml-advisory` kind (D-02), match on hostname (and
optionally scheme allowlist both `http:`/`https:`) rather than a fixed scheme+host string, and
normalize the URL to `https://` before calling `fetchBinBuffer` — this also sidesteps
`fetchBinBuffer`'s `redirect: "error"` throwing on the redirect SPC itself issues.
**Warning signs:** the existing probe suite has no scenario that drives this path with a live-shaped
href — `[VERIFIED: live fetch]` this session is the only evidence; a probe fixture using
`http://www.spc.noaa.gov/...` (matching the real feed) should be added so this doesn't silently
regress again.

### Pitfall 2: MPD numbering resets yearly with no active-index — number-sort silently selects stale discussions

**What goes wrong:** A location inside a genuinely expired, 6-month-old MPD could be shown as
currently active, or a currently active MPD could be missed, if candidate selection is driven by
"highest filename number."
**Why it happens:** Live-reproduced this session: `https://www.wpc.ncep.noaa.gov/kml/mpd/` (the
current, unarchived directory) contains `MPD_1281_final.kmz` (`IssueTime`: "502 AM EST Sun Dec 28
2025") sitting alongside `MPD_1118_final.kmz` (`IssueTime`: "734 PM EDT Sun Aug 23 2026" — today).
`1281 > 1118` numerically. There is no `ActiveMD.kmz`-equivalent index for MPD; the directory is a
flat, unfiltered archive of every MPD issued this year plus year-boundary stragglers.
**How to avoid:** Two-layer discovery (see Pattern 2 / Open Question 2): (1) cheap pre-filter using
the directory listing's own `Last-Modified` column/HTTP header to discard obviously-stale
candidates before fetching their KMZs; (2) authoritative filter using each candidate's own
`ValidEndTi` (resolved against `IssueTime`, see Pattern 4) compared to `now`. Never trust the
filename number alone.
**Warning signs:** any implementation that does `filenames.sort().pop()` or similar on the
directory listing.

### Pitfall 3: `@tmcw/togeojson` wraps KML `description` CDATA as an object, not a string

**What goes wrong:** Code that does `feature.properties.description.match(/<td>MPDType/)` throws
(`TypeError: descriptionValue.match is not a function`) or, if guarded with `typeof === "string"`,
silently always takes the "no hazard type" branch — which D-06 says must still render but log; a
100%-miss-rate parse looks superficially "working" (nothing crashes) while quietly failing every
single MPD.
**Why it happens:** Verified live this session: `KMLtoGJ.kml(doc)` on a real MPD KML produces
`properties.description = { "@type": "html", "value": "<html>...</html>" }`.
**How to avoid:** Always unwrap `.value` when `description` is an object (see Pattern 3's
`extractMpdField`/`mpdHazardType`).
**Warning signs:** D-06's "log the parse miss" firing on every MPD in a probe scenario that expects
a hazard type — a 100% miss rate on a scenario with a fixture that structurally contains the field
is the signature of this bug, distinct from a genuine missing-field case.

### Pitfall 4: WPC's real WSSI value domain has no "Limited" tier, and "Winter Weather Area" is explicitly a non-impact placeholder

**What goes wrong:** Planning or implementing against literal string `"LIMITED"` (as D-09's prose
suggests) will never match anything — the field never contains that string — so the "renders a row"
gate silently never fires for the lowest tier, OR (if "Winter Weather Area" is mistakenly treated as
the bottom "impact" rung) users see a row for areas WPC's own documentation says are "not
anticipated to impact daily life."
**Why it happens:** D-09 was drafted before the real value domain was confirmed. The live renderer
domain is `WINTER WEATHER AREA → MINOR → MODERATE → MAJOR → EXTREME`, with `WINTER WEATHER AREA`
documented server-side as explicitly non-impactful.
**How to avoid:** See Open Question 1 — recommended mapping is `MINOR` and above renders a row;
`WINTER WEATHER AREA` and no-polygon render nothing (treated the same as `NONE`), pending explicit
confirmation since this reinterprets D-09's literal wording.
**Warning signs:** a probe fixture asserting on the string `"LIMITED"` that can never go RED because
no code path can ever produce that string from live data.

### Pitfall 5: Socket index migration (`[outlook, md, seq]` → `[outlook, seq]`) must be atomic

**What goes wrong:** If `node_helper.js`'s `sendSocketNotification` payload shape changes before
(or without) `MMM-SPCOutlook.js`'s `socketNotificationReceived` changing its `payload[2]` read to
`payload[1]`, the frontend reads an object (`this._seq`, a number) where it expects... actually the
inverse failure is worse: with the OLD frontend code and the NEW backend shape, `payload[2]` is
`undefined` (array now length 2), so `typeof seq === "number"` is `false`, and the code's own comment
says "a payload with no sequence... is still accepted" — meaning CR-03's out-of-order protection
silently stops working entirely, with no error, no log line, and no test failure unless a scenario
specifically drives two out-of-order chains through the real frontend.
**Why it happens:** Two files, two independent edit sites, no compile-time contract between them
(vanilla JS, no shared types).
**How to avoid:** Change both call sites in the same task/commit; extend
`frontend-total-outage-still-shows-the-outage`-style probe scenario to also assert seq-based
discard still works post-migration (CR-03's original guarantee, re-verified against the new index).
**Warning signs:** `_lastSeq` behavior identical whether payloads are in-order or reversed — the
sign that discard silently became a no-op.

## Code Examples

### WSSI MapServer layer discovery (live, verbatim)
```
// Source: https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/wpc_wssi/MapServer?f=json
// fetched live 2026-08-24
{
  "mapName": "Winter Storm Severity Index",
  "layers": [
    { "id": 0, "name": "Overall Impact", "type": "Group Layer", "subLayerIds": [1,2,3,4] },
    { "id": 1, "name": "Overall_Impact_Day_1", "type": "Feature Layer" },
    { "id": 2, "name": "Overall_Impact_Day_2", "type": "Feature Layer" },
    { "id": 3, "name": "Overall_Impact_Day_3", "type": "Feature Layer" },
    { "id": 4, "name": "Overall_Impact_Days_1-3", "type": "Feature Layer" }
  ]
}
```

### WSSI Day-1 layer fields (live, verbatim excerpt)
```
// Source: .../wpc_wssi/MapServer/1?f=json, fetched live 2026-08-24
fields: [
  { name: "impact", type: "esriFieldTypeString", alias: "Impact" },
  { name: "valid_time", type: "esriFieldTypeString", alias: "Valid Time" },
  { name: "component", type: "esriFieldTypeString", alias: "Component" },
  { name: "issue_time", type: "esriFieldTypeString", alias: "Issue Time" }
  // ...
]
```

### WSSI palette (live, verbatim, per D-08's "cite the source" requirement)
```
// Source: .../wpc_wssi/MapServer/1?f=json → drawingInfo.renderer.uniqueValueInfos
// (identical for layers 1, 2, and 3 — verified live for all three)
// RGB → hex conversion done in this research session; store hex with no leading "#"
// to match the existing eroTierToColor convention.
{
  "WINTER WEATHER AREA": { rgb: [210, 223, 231], hex: "d2dfe7", label: "Winter Weather Area" },
  "MINOR":               { rgb: [250, 245, 163], hex: "faf5a3", label: "Minor Impacts" },
  "MODERATE":            { rgb: [247, 150, 47],  hex: "f7962f", label: "Moderate Impacts" },
  "MAJOR":               { rgb: [230, 31, 38],   hex: "e61f26", label: "Major Impacts" },
  "EXTREME":             { rgb: [120, 83, 161],  hex: "7853a1", label: "Extreme Impacts" }
}
```

### WSSI zero-feature off-season response (live, verbatim — directly satisfies WSSI-03's structural verification)
```
// Source: GET .../wpc_wssi/MapServer/1/query?where=1%3D1&outFields=*&f=geojson
// fetched live 2026-08-24 (off-season)
{"type":"FeatureCollection","features":[]}
```
This is structurally identical to the shape `_isFeatureCollection`/`extractPolygons` already
handle correctly for a no-risk ERO day — no new code path is required for WSSI-03; only a probe
fixture pinning this exact shape is needed.

### MPD directory listing (live, verbatim excerpt — the ONLY discovery mechanism available)
```
// Source: https://www.wpc.ncep.noaa.gov/kml/mpd/  (139,476 bytes, fetched live 2026-08-24)
// Apache "Index of" HTML listing. No JSON/KML index exists. Columns: name, Last-Modified, size.
<a href="MPD_1118_final.kmz">MPD_1118_final.kmz</a>   2026-08-23 08:13  3.0K
<a href="MPD_1281_final.kmz">MPD_1281_final.kmz</a>   2026-01-23 16:07  3.2K   <- STALE, see Pitfall 2
<a href="MPD_latest.kmz">MPD_latest.kmz</a>           2026-08-23 23:40  3.0K   <- single pointer,
                                                                                    insufficient for
                                                                                    MPD-02 (need ALL)
<a href="2025/">2025/</a>                              2025-12-31 13:07  -      <- prior-year archive
```

### MPD hazard-type table (live, verbatim, from `MPD_1118_final.kmz`)
```html
<!-- Source: doc.kml inside MPD_1118_final.kmz, fetched+unzipped live 2026-08-24 -->
<tr><td>FID</td><td>0</td></tr>
<tr bgcolor="#D4E4F3"><td>ValidStart</td><td>232333</td></tr>
<tr><td>ValidEndTi</td><td>240515</td></tr>
<tr bgcolor="#D4E4F3"><td>IssueTime</td><td>734 PM EDT Sun Aug 23 2026</td></tr>
<tr><td>MPDNumber</td><td>1118</td></tr>
<tr bgcolor="#D4E4F3"><td>Forecaster</td><td>Otto</td></tr>
<tr><td>MPDType</td><td>Heavy rainfall, Flash flooding possible</td></tr>
<tr bgcolor="#D4E4F3"><td>WFO</td><td>PSR, TWC</td></tr>
```
Confirmed present with the same field set (FID/ValidStart/ValidEndTi/IssueTime/MPDNumber/
Forecaster/MPDType/WFO/RFC/MPD/Area_Units/Area) across all 9 live samples pulled this session
(numbers 0100, 0300, 0500, 0700, 0900, 1114, 1116, 1117, 1281 — spanning the full current-year
range plus one prior-year straggler). `MPDType` observed values: "Heavy rainfall, Flash flooding
possible" and "Heavy rainfall, Flash flooding likely" — both variants confirmed live.

### SPC MD structure (live, verbatim — confirms D-02's migration is low-risk for the *display* half)
```xml
<!-- Source: MD2108.kml, extracted live from https://www.spc.noaa.gov/products/md/MD2108.kmz
     (note: the ActiveMD.kmz index itself serves the http:// href; see Pitfall 1) -->
<Document>
  <name>MD 2108</name>
  ...
  <Placemark>
    <name>MD 2108</name>   <!-- usable as-is; unlike MPD's raw DTG Placemark name -->
    <description><![CDATA[<html><body><table>...</table></body></html>]]></description>
    ...
  </Placemark>
</Document>
```
SPC MD's own Placemark `<name>` is already a clean, human-readable label ("MD 2108") — confirms
`hit.properties.name` (existing code) continues to work unchanged for SPC MD after migration, and
that MPD needs a *different* label strategy (its Placemark `<name>` is a raw `"232333"` DTG string;
build the display label from the description table's `MPDNumber` field instead, per D-05's `WPC MPD
0456` format).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| SPC MD fetched/rendered standalone via `node_helper.js` free functions, `md` as its own socket element | SPC MD migrated into `PRODUCT_REGISTRY` as a `kml-advisory` row alongside MPD, inside `outlook.advisories` | This phase (D-02, D-03) | Fixes the WR-06-class divergence risk the review flagged (fix lands on one advisory path, not both); also the moment to fix the live `http://` scheme-allowlist defect (Pitfall 1) |

**No externally-deprecated APIs found.** All fetched WPC/CPC endpoints (`wpc_wssi` MapServer,
`/kml/mpd/` directory, `ActiveMD.kmz`) responded live and current as of 2026-08-24; nothing in this
phase's research surfaced a superseded endpoint or a documented-but-removed field.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | `WINTER WEATHER AREA` should be treated the same as `NONE` for D-09's row-rendering gate (i.e. "Minor and above renders") rather than as the bottom rung of "renders" | Pitfall 4, Open Question 1 | If wrong, users either see a row WPC itself says has no impact (over-alerting, minor UX annoyance) or lose a genuinely WPC-issued classification (under-alerting, contradicts the project's no-false-negatives core value) — needs explicit confirmation, not silent implementation |
| A2 | Only EST/EDT timezone abbreviations were confirmed live this session (all 9 sampled WFOs were eastern-half offices); CST/CDT/MST/MDT/PST/PDT are asserted from general WPC/NWS convention knowledge, not independently observed in a live MPD sample this session | Pattern 4 | Low risk — these are standard, well-documented NWS timezone abbreviations, but a Central/Mountain/Pacific-issued MPD sample should be captured for the probe fixture set before trusting the full table in production |
| A3 | The directory-listing `Last-Modified` recency pre-filter window should be generous (e.g. 24-48h) given observed MPD validity windows of 3-6 hours plus polling-interval slack | Pitfall 2, Pattern 2 | If the window is too tight, a slow-polling deployment could miss a still-valid MPD near the window edge; if too loose, more KMZs are fetched per poll than strictly necessary (bounded cost, not a correctness risk) — exact window is an implementation/planning choice, not independently verified against a documented WPC SLA |
| A4 | `MPD_latest.kmz` always reflects the single most-recently-issued MPD and is safe to use as a smoke-test/fallback signal (e.g., "is the feed alive at all") but is NOT sufficient alone for MPD-02, which requires ALL active MPDs | Code Examples (MPD directory listing) | Low risk — directly observed live (`MPD_latest.kmz`'s embedded `MPDNumber` matched the highest genuinely-current number, 1118, this session), but its update semantics (does it always update, or only on certain conditions) were not documented anywhere found |

**Planner note:** A1 is the highest-priority item to resolve before implementation — it directly
reinterprets a locked decision's (D-09) literal wording against a real value domain that didn't
exist in the decision-maker's hands at discussion time.

## Open Questions (ALL RESOLVED — see resolution notes inline)

> **Resolution status (recorded 2026-08-23 during /bm:plan-phase 15):** all three questions
> below were answered before planning locked. Q1 was escalated to the user and confirmed; Q2
> and Q3 were Claude's-Discretion items resolved on this research's own recommendation. The
> plans implement these answers; the plan-checker verified that independently.

1. **[RESOLVED — user-confirmed 2026-08-23: `MINOR` and above renders; `WINTER WEATHER AREA` renders nothing, same bucket as no-polygon. See the AMENDED block on D-09 in 15-CONTEXT.md.]** **Does "Limited and above renders a row" (D-09) mean "Minor and above" in WPC's real domain, and
   is `WINTER WEATHER AREA` treated as non-rendering (like `NONE`) or as the bottom rendering rung?**
   - What we know: WPC's live renderer domain is `WINTER WEATHER AREA, MINOR, MODERATE, MAJOR,
     EXTREME` — no `LIMITED` value exists anywhere in the schema or the renderer. WPC's own service
     description explicitly states `WINTER WEATHER AREA` is "not anticipated to impact daily life."
   - What's unclear: whether the phase's stakeholder intended "Limited" as a placeholder synonym for
     whatever WPC's lowest tier turned out to be (in which case A1's "Minor and above" mapping is
     correct) or whether the "winter weather area" tier itself was meant to be included as a "genuine
     WPC-issued impact level" per D-09's stated rationale.
   - Recommendation: treat `WINTER WEATHER AREA` as non-rendering (same bucket as `NONE`/no-polygon)
     per WPC's own "not anticipated to impact daily life" framing, and confirm this reading during
     planning or plan-check rather than silently choosing.

2. **[RESOLVED — recommendation accepted: ~48h `Last-Modified` pre-filter as a fetch-count optimization ONLY; the authoritative active/inactive decision is each candidate's own `ValidEndTi`, evaluated unconditionally. The pre-filter must never be the sole inclusion gate. Implemented in 15-06.]** **What is the right pre-filter recency window for MPD directory-listing discovery, and should the
   Last-Modified pre-filter be skipped entirely in favor of always parsing every candidate's own
   `ValidEndTi`?**
   - What we know: MPD validity windows observed live ranged 3h-6h; the current-year directory has
     1000+ entries (139KB listing) plus at least one stray prior-year straggler (`MPD_1281`).
   - What's unclear: whether WPC ever republishes/touches an old file's Last-Modified timestamp
     (which would break a naive recency filter), and what the realistic upper bound on
     `updateInterval` is for this project (config-driven, unbounded per WR-05's fix, though defaulted
     to 60 minutes) — a very long configured `updateInterval` could, in principle, poll less often
     than an MPD's validity window, in which case a tight recency filter risks missing one.
   - Recommendation: use a generous (e.g. 48h) Last-Modified pre-filter purely as a fetch-count
     optimization (cost control, not correctness), and make the authoritative "is it still active"
     decision from each candidate's own `ValidEndTi` unconditionally — never let the pre-filter alone
     decide inclusion/exclusion.

3. **[RESOLVED — recommendation accepted: remove outright, no shim, per D-03's target shape `[outlook, seq]`. No other consumer exists in this single-instance deployment. Implemented in 15-07.]** **Should the retired `md` socket element leave a compatibility shim (e.g., always send `false` at
   index 1 for one release) or be removed outright?**
   - What we know: this is explicitly flagged as Claude's Discretion in CONTEXT.md; there are no
     other consumers of this socket notification (single-module, single-instance deployment per
     STATE.md's "Deployment reality" note).
   - What's unclear: nothing technical — this is a pure judgment call with no other consumer to break.
   - Recommendation: remove outright (per D-03's explicit target shape `[outlook, seq]`) — a shim
     protects against a consumer that provably does not exist in this deployment, and the project's
     "no legacy fallback" precedent (set explicitly for the Phase 19 display rewrite) argues against
     carrying one here either.

## Environment Availability

No new external tools, runtimes, or services are required beyond what Phase 14 already depends on
(Node.js + the five npm packages listed in Standard Stack, already installed in this repo's
`node_modules/`). All external endpoints used by this phase (`mapservices.weather.noaa.gov`,
`www.wpc.ncep.noaa.gov`, `www.spc.noaa.gov`) were reachable and responded 200 during this research
session — no fallback planning needed.

## Validation Architecture

`workflow.nyquist_validation` is disabled for this project (`.planning/config.json`); the standard
per-requirement test-map template is skipped. Per D-10, this section instead describes how to
extend the existing `scripts/probe-payload-resilience.js` / `scripts/probe-lib/module-stubs.js`
harness for the new scenarios.

### Existing harness recap
- `module-stubs.js` patches Node's module resolver so `node_helper.js` loads with zero third-party
  packages installed, and provides `turfStub`, `loggerStub`, `resetHelper`, `resetLogs`,
  `loadFrontendModule`/`renderDom` (runs the real `getDom` in a `vm` sandbox).
- `probe-payload-resilience.js` drives the real `fetchGeoJsonCached` through the `_fetch(url,
  options)` seam (WR-09) via `installFetch(helper, routes)` — a URL-substring router — so 304
  handling, ETag/hash caching, and the stale-fallback logic all execute for real, not via a stubbed
  shortcut.
- 15 scenarios currently exist, all mutation-proven (14-REVIEW-FIX.md's standard: for each, a
  targeted source mutation turns it RED, then is reverted).

### Extension for WSSI (mirrors the existing `ero-*` scenarios)
New fixtures needed, keyed the same way `ARCGIS_ERROR_BODY`/`ERO_SLGT_BODY` are today:
- `WSSI_MINOR_BODY` / `WSSI_MODERATE_BODY` / `WSSI_MAJOR_BODY` / `WSSI_EXTREME_BODY` — each a
  FeatureCollection with one polygon feature carrying `properties.impact` set to the ALL-CAPS raw
  value (`"MINOR"`, etc.) — directly copy-pasteable from the live-verified value domain in this
  research's Code Examples.
- `WSSI_MIXED_CASE_BODY` — a fixture with `properties.impact: "Minor"` (mixed case) to prove
  WSSI-02's case-fold is load-bearing: mutate the fold to an exact-match lookup, confirm this
  scenario goes RED, restore.
- `WSSI_EMPTY_FEATURES_BODY` — `{"type":"FeatureCollection","features":[]}`, the exact live
  off-season shape captured this session, satisfying WSSI-03 structurally.
- Scenario names to add (following the `ero-*` naming convention):
  `wssi-wellformed-minor`, `wssi-case-fold-mismatch-still-resolves`, `wssi-toggle-off`,
  `wssi-zero-features-out-of-season`, `wssi-hard-fail-is-flagged`.

### Extension for MPD/SPC MD (new territory — no existing `md-*`/`mpd-*` scenario category)
- Reuse `installFetch`'s URL-substring router for the WSSI/ERO-style ArcGIS calls; for the
  `kml-advisory` kind's binary KMZ fetches, extend (or add a sibling to) the `_fetch` seam stubbing
  so `fetchBinBuffer`'s real implementation runs against stubbed `Buffer` responses — the probe
  should NOT stub `fetchBinBuffer` itself, mirroring WR-09's lesson about stubbing too high a layer.
- Fixture data needed (all copy-pasteable from this research's live captures):
  1. A synthetic MPD KMZ buffer (built in-memory with `adm-zip`, not fetched live in the probe)
     containing a `doc.kml` entry shaped exactly like the live `MPD_1118_final.kmz` sample, for
     `mpd-hazard-type-extracted-from-description`.
  2. A variant with the `MPDType` row absent from the description table, for
     `mpd-missing-hazard-type-renders-without-it-logs-miss` (D-06).
  3. Two synthetic MPD directory-listing HTML fixtures: one where the highest-numbered entry is
     stale (mirroring the real `MPD_1281`/`MPD_1118` case captured live) and a lower-numbered entry
     is current and valid — for `mpd-year-boundary-does-not-select-stale-highest-number` (MPD-04's
     direct regression guard, using the REAL captured field values from this research as the
     fixture's `IssueTime`/`ValidEndTi`, not synthetic placeholders).
  4. A live-shaped `ActiveMD.kmz` index fixture with an `http://` (not `https://`) href, for
     `spc-md-http-href-not-rejected-by-allowlist` — this is the regression guard for Pitfall 1 and
     must exist before the fix is even written, so the scenario can go RED against today's code
     first.
  5. Two-concurrently-active-MPDs fixture (two candidate KMZs both containing the probe's test
     coordinate) for `mpd-multiple-concurrent-all-shown` (MPD-02's direct regression guard —
     asserts array length 2, not 1).
- Every new scenario must be mutation-proven per D-10: for the year-boundary scenario specifically,
  the load-bearing mutation is reverting the discovery logic to `filenames.sort().pop()` and
  confirming the scenario turns RED (selects the stale entry) before the fix, then GREEN after.

### Sampling rate
- **Per task commit:** `node scripts/probe-payload-resilience.js` (full suite; there is no
  faster/partial run mode today, and the suite already runs offline with zero network calls).
- **Phase gate:** full suite green, plus D-10's live MPD UAT if any MPD fires during the phase
  (structural WSSI-only verification stands in for live WSSI UAT, deferred in-season).

## Security Domain

`security_enforcement` is not set in `.planning/config.json` (absent = enabled).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V5 Input Validation | Yes | Host allowlist on every fetched URL (existing `MD_HOST_PREFIX` pattern, extended to WPC's `www.wpc.ncep.noaa.gov` host and fixed per Pitfall 1); `escapeHtml` on every remote string reaching `innerHTML` (existing convention — MPD hazard-type text and any advisory name are equally remote/unbounded and must go through the same escape) |
| V12 File and Resources (SSRF) | Yes | `redirect: "error"` on every KMZ fetch (existing convention, `fetchBinBuffer`) so a URL that passes the allowlist cannot be redirected off-host after the check; this phase's MPD directory-listing fetch and per-candidate KMZ fetches must both go through the same allowlisted, redirect-refusing path — no new "convenience" fetch that bypasses it |
| V2/V3/V4 (Auth/Session/Access Control) | No | Single-instance, single-location, no authentication surface — out of scope, matches Phase 14's precedent |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-----------------------|
| SSRF via attacker-influenced KML `<href>` (upstream compromise, hostile DNS, captive portal) driving a fetch to an RFC1918 address | Spoofing/Tampering | Host allowlist before fetch (existing `MD_HOST_PREFIX` pattern) + `redirect: "error"` (existing `fetchBinBuffer` convention) — extend both to the new `www.wpc.ncep.noaa.gov` host for MPD's directory listing and per-candidate KMZ fetches |
| Reflected/stored XSS via unbounded remote text (MPD hazard type, MPD/MD display names) reaching `innerHTML` | Tampering | `escapeHtml` on every value interpolated into the advisory band's HTML string — this phase adds two new untrusted string sources (MPD's `MPDType` and any WSSI-derived text) that must go through the same existing escape function used for MD names today |
| Directory-listing enumeration cost (1000+ entries, 139KB) as an amplification vector if `updateInterval` is misconfigured very low | Denial of Service (self-inflicted, against NOAA's own service) | WR-05's existing `updateInterval` clamp (minimum enforced, defaults to 60) already bounds poll frequency; no new mitigation needed, but worth noting the new MPD directory fetch is heavier than existing per-poll fetches and should not be exempted from that clamp |

## Sources

### Primary (HIGH confidence — all fetched live during this research session, 2026-08-23/24)
- `https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/wpc_wssi/MapServer?f=json` —
  layer inventory, service description, update cadence
- `https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/wpc_wssi/MapServer/1?f=json`
  (and `/2`, `/3`) — field schema, `drawingInfo.renderer` (palette + raw value domain), confirmed
  identical across all three day layers
- `https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/wpc_wssi/MapServer/1/query?where=1%3D1&outFields=*&f=geojson`
  — live off-season zero-feature response (WSSI-03 structural proof)
- `https://www.wpc.ncep.noaa.gov/kml/mpd/` and `.../2025/` — directory listing structure, year
  archival behavior, the live `MPD_1281`/`MPD_1118` stale-straggler case
- `https://www.wpc.ncep.noaa.gov/kml/mpd/MPD_1118_final.kmz` (and 8 other numbers spanning
  0100-1281) — real KMZ contents, decoded with this repo's own `adm-zip` + `@xmldom/xmldom` +
  `@tmcw/togeojson`, run live via `node -e` against the actual installed dependencies
- `https://www.spc.noaa.gov/products/md/ActiveMD.kmz` and `MD2108.kmz` — live SPC MD index and
  member structure, confirming the `http://` href defect (Pitfall 1) and the existing
  `hit.properties.name` assumption still holds post-migration
- This repository: `productRegistry.js`, `node_helper.js`, `MMM-SPCOutlook.js`,
  `scripts/probe-payload-resilience.js`, `scripts/probe-lib/module-stubs.js`,
  `.planning/phases/14-foundation-wpc-excessive-rainfall-outlook/{14-CONTEXT,14-REVIEW,14-REVIEW-FIX}.md`
  — read in full for existing conventions and defect history

### Secondary (MEDIUM confidence)
- `https://www.wpc.ncep.noaa.gov/kml/kmlproducts.php` — confirms no MPD KML/KMZ product is
  advertised on WPC's own public KML products index page (the `/kml/mpd/` directory is undocumented
  there; discovered via web search, then independently confirmed live)

### Tertiary (LOW confidence)
- General WPC/NWS timezone-abbreviation convention (CST/CDT/MST/MDT/PST/PDT) — not independently
  observed in a live MPD sample this session (only EST/EDT were); see Assumptions Log A2

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; every reused function verified against this repo's
  actual, current source
- Architecture (WSSI): HIGH — live-verified layer IDs, field names, and value domain directly from
  the production MapServer
- Architecture (MPD/SPC MD): HIGH — live-verified via real KMZ downloads and actual decoding through
  this project's own installed dependencies, not documentation paraphrase
- Pitfalls: HIGH — all five pitfalls are either directly reproduced against live data (Pitfalls 1,
  2, 3) or derived from a direct code/documentation contradiction found this session (Pitfalls 4, 5)
- Open Question 1 (D-09 remapping): MEDIUM — the factual domain is HIGH confidence; the correct
  policy interpretation is a judgment call requiring confirmation

**Research date:** 2026-08-23 / 2026-08-24
**Valid until:** ~30 days for the ArcGIS schema/field names (stable, matches ERO's precedent from
Phase 14); ~7 days for the specific MPD sample numbers/timestamps cited as evidence (they are
snapshots of a rapidly-incrementing live feed — the *mechanism* they demonstrate, not the specific
numbers, is what planning should rely on)
