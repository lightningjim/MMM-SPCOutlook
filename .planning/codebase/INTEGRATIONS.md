# External Integrations

**Analysis Date:** 2026-03-04

## APIs & External Services

**Weather Data:**
- NOAA Storm Prediction Center (SPC) - Convective outlooks and mesoscale discussions
  - SDK/Client: `node-fetch` with custom GeoJSON fetching
  - Format: GeoJSON with polygon geometries and risk/probability labels
  - Authentication: None (public API)

## Data Storage

**Databases:**
- Not used - Module operates stateless, fetching fresh data on each request

**File Storage:**
- None - No persistent file storage

**Caching:**
- None detected - Data is re-fetched based on `updateInterval` configuration

## Authentication & Identity

**Auth Provider:**
- None - Public NOAA APIs require no authentication
- Implementation: Direct HTTP requests via `node-fetch`

## Monitoring & Observability

**Error Tracking:**
- None detected

**Logs:**
- Console logging via `console.log()` and `console.error()` in `node_helper.js`
- MagicMirror logger integration via `Log.info()`, `Log.error()` methods (imported from "logger")
- Sample log patterns:
  - Data fetch status: `console.log("SPC-Outlook: GET_SPC_DATA - " + this.config.lat + "," + this.config.lon)`
  - Parse results: `console.log("SPC-Outlook: SPC_DATA_RESULT Received")`
  - MD evaluation: `console.log("SPC-Outlook MD Test:" + MDgj.features[0].properties.name)`

## CI/CD & Deployment

**Hosting:**
- MagicMirror² modules typically run on Raspberry Pi or headless Linux systems
- No cloud deployment; module runs locally on display hardware

**CI Pipeline:**
- None detected - No GitHub Actions or CI config files

## Environment Configuration

**Required env vars:**
- None - All configuration via MagicMirror module config object:
  - `lat`: Latitude of location to monitor
  - `lon`: Longitude of location to monitor
  - `extended`: Boolean to show Day 4-8 outlooks
  - `updateInterval`: Minutes between data refreshes (default: 60)

**Secrets location:**
- Not applicable - Public APIs with no authentication

## Webhooks & Callbacks

**Incoming:**
- None - Module only receives socket notifications from MagicMirror core

**Outgoing:**
- None - Module sends socket notifications to MagicMirror core (`SPC_DATA_RESULT`)
- Socket notification protocol:
  - Request: `"GET_SPC_DATA"` with `{ lat, lon, extended }` payload
  - Response: `"SPC_DATA_RESULT"` with array `[outlook_obj, mesoscale_discussions_array]`

## Data Sources & APIs in Detail

**SPC GeoJSON Endpoints:**
- All endpoints return GeoJSON FeatureCollections with Polygon or MultiPolygon geometries
- Day 1-2 endpoints include separate layers for categorical risk, tornado probability, hail probability, wind probability
- Day 3 endpoints include categorical, probability, and significant probability layers
- Day 4-8 endpoints return experimental probabilistic outlooks
- Feature properties include:
  - `LABEL`: Risk category (TSTM, MRGL, SLGT, ENH, MDT, HIGH) or percentage/SIGN indicator
  - `name`: Human-readable description (e.g., "Marginal Risk", "5% Tornado")

**SPC Mesoscale Discussion (KMZ):**
- Primary URL: `https://www.spc.noaa.gov/products/md/ActiveMD.kmz`
- Returns compressed KML archive containing:
  - NetworkLinks pointing to individual MD KMZ files
  - Each MD has geographic polygon and text description
- Processed by:
  - `adm-zip` to extract KML from KMZ
  - `@xmldom/xmldom` DOMParser to parse KML XML
  - `xpath` to query NetworkLink hrefs
  - `@tmcw/togeojson` to convert to GeoJSON for point-in-polygon testing

## Integration Points in Code

**Frontend Module (`MMM-SPCOutlook.js`):**
- Entry point: `Module.register("MMM-SPCOutlook", {...})`
- Initiates data fetch via `sendSocketNotification("GET_SPC_DATA", {...})`
- Receives updates via `socketNotificationReceived("SPC_DATA_RESULT", payload)`
- Renders data using MagicMirror DOM API
- Uses `weather-icons` CSS for tornado, hail, wind icons

**Node Helper (`node_helper.js`):**
- Handles all HTTP requests to SPC APIs via `node-fetch`
- Processes polygon data with `@turf/turf` for point-in-polygon testing
- Manages KMZ extraction and KML parsing for mesoscale discussions
- Evaluates location against multiple outlook layers (categorical, probability, significant)
- Returns structured risk assessment to frontend

---

*Integration audit: 2026-03-04*
