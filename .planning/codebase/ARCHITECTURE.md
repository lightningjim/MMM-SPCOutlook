# Architecture

**Analysis Date:** 2026-03-04

## Pattern Overview

**Overall:** MagicMirror Module with Client-Server Architecture

**Key Characteristics:**
- **MagicMirror Pattern:** Module registers with MagicMirror framework and communicates via socket notifications
- **Geospatial Processing:** Uses Turf.js for point-in-polygon queries against NOAA SPC outlook data
- **Data Transformation Pipeline:** Fetches GeoJSON from external NOAA APIs, processes spatial data, evaluates risk levels, and returns formatted risk information
- **Asynchronous Backend Processing:** Node.js helper handles all external API calls and spatial computations
- **Frontend Rendering:** Client-side module renders risk data with color coding and weather icons

## Layers

**Frontend/UI Layer:**
- Purpose: Display SPC convective outlook risk information with styling and icons
- Location: `MMM-SPCOutlook.js`
- Contains: Module registration, DOM rendering, socket notification handling, display formatting
- Depends on: MagicMirror framework, weather-icons CSS library
- Used by: MagicMirror display system

**Backend/Node Helper Layer:**
- Purpose: Fetch external NOAA data, perform spatial analysis, compute risk levels for a given location
- Location: `node_helper.js`
- Contains: API fetching, KML/KMZ parsing, geospatial queries, risk evaluation logic
- Depends on: Turf.js (geospatial), @xmldom (KML parsing), @tmcw/togeojson (KML-to-GeoJSON conversion), adm-zip (KMZ extraction), node-fetch (HTTP requests), xpath (XML queries)
- Used by: MagicMirror socket notification system

**Communication Layer:**
- Purpose: Bridge between frontend and backend via socket notifications
- Location: Both `MMM-SPCOutlook.js` and `node_helper.js`
- Contains: Socket notification handlers (`sendSocketNotification`, `socketNotificationReceived`)
- Communication: Request `GET_SPC_DATA` with location payload, Response `SPC_DATA_RESULT` with computed outlook data

## Data Flow

**Initial Module Load:**

1. Module `start()` function triggered by MagicMirror
2. Frontend sends socket notification: `GET_SPC_DATA` with `{ lat, lon, extended }`
3. Backend receives notification and initiates data fetching and processing
4. Frontend receives `SPC_DATA_RESULT` socket notification with processed outlook data
5. `getDom()` renders HTML using received data
6. DOM updates with risk information and weather icons

**Periodic Updates:**

1. Frontend sets interval timer in `start()` (configurable, default 60 minutes)
2. Each interval triggers socket notification with same location data
3. Backend re-fetches latest NOAA SPC outlook data
4. Frontend re-renders with updated risk information

**Geospatial Processing:**

1. Backend fetches multiple GeoJSON files from NOAA API endpoints (categorical, tornado, hail, wind overlays for Days 1-2; categorical and probability for Day 3; probability-only for Days 4-8)
2. For each overlay type, polygons are extracted from GeoJSON features
3. User location (latitude/longitude) is converted to Turf point geometry
4. Polygons are evaluated using `booleanPointInPolygon` to determine which risk zones contain the user's location
5. Multiple evaluation strategies support: basic point-in-polygon, continuous decay weighting, weighted averaging
6. Risk values are mapped to categorical labels (NONE, TSTM, MRGL, SLGT, ENH, MDT, HIGH)
7. Results aggregated into day-by-day risk object with color and text representations

**Mesoscale Discussion Processing:**

1. Backend fetches Active Mesoscale Discussion KMZ file from NOAA
2. KMZ is extracted to KML and parsed
3. Network links extracted from KML identify individual MD files
4. Each MD file is fetched, extracted, and checked for spatial containment
5. Matching MD names returned in array to frontend

## State Management

**Frontend State:**
- `this.spcrisk`: Main risk data object with Day 1-8 risk information
- `this.mds`: Array of active Mesoscale Discussion names
- Updated via `socketNotificationReceived()` when `SPC_DATA_RESULT` arrives
- Triggers `updateDom()` to re-render display

**Backend State:**
- No persistent state maintained between requests
- Each request fully re-fetches and re-computes all data
- Results returned as complete outlook object

## Key Abstractions

**Risk Evaluation Functions:**

- `evaluatePolygons()`: Basic point-in-polygon evaluation, returns max risk found
  - Purpose: Determine if location is within any risk polygon and find highest category
  - Pattern: Iterate through polygons, test point containment, track maximum value

- `evaluatePolygonsContinuous()`: Continuous decay weighting for boundary transitions
  - Purpose: Smooth risk transitions near polygon boundaries using exponential decay
  - Pattern: Check containment, evaluate distance to higher-risk zones, apply decay function

- `evaluatePolygonsWeighted()`: Weighted average considering proximity to multiple zones
  - Purpose: Blend risk levels considering distance to multiple risk areas
  - Pattern: Weight contribution of each polygon by exponential distance decay

**Data Extraction Functions:**

- `extractPolygons()`: Convert GeoJSON features to queryable polygon objects
  - Input: GeoJSON, label-to-value mapper, filter predicate
  - Output: Array of `{label, value, poly}` objects with Turf geometry
  - Pattern: Map and filter GeoJSON features, construct Turf polygon objects

- `extractKmlFromKmz()`: Extract KML string from zipped KMZ file
  - Pattern: ZIP library instantiation, entry lookup, file read and string conversion

- `parseNetworkLinks()`: Extract network link URLs from KML XML
  - Pattern: DOMParser with XPath queries to find NetworkLink elements

**Data Mapping Objects:**

- `riskToValue`: Maps risk category strings (TSTM, MRGL, SLGT, ENH, MDT, HIGH) to numeric levels (1-6)
- `valueToRisk`: Reverse mapping from numbers to category strings
- `riskToColor`: Maps risk categories to CSS hex color codes for display
- `valueToFullRisk`: Maps short codes to full text descriptions (e.g., MRGL → "Marginal")

## Entry Points

**Frontend Entry:**
- Location: `MMM-SPCOutlook.js` line 1
- Triggers: MagicMirror framework instantiation
- Responsibilities: Module registration, configuration defaults, lifecycle management (start, socket notifications, DOM rendering)

**Backend Entry:**
- Location: `node_helper.js` line 19-22
- Triggers: MagicMirror framework spawns node helper process
- Responsibilities: Server process initialization, socket listener setup, request handling

**Primary Request Flow:**
- Location: `MMM-SPCOutlook.js` lines 9-15 (start function)
- Triggers: Module start event
- Responsibilities: Send initial data request, establish periodic update interval

## Error Handling

**Strategy:** Try-catch at backend with error object returned to frontend

**Patterns:**
- Backend `getSpcOutlook()` wraps entire logic in try-catch, returns `{error: err.toString()}` on failure
- Frontend checks for `spcrisk.error` before rendering, displays error message
- Network failures in `fetchGeoJson()` caught, null returned, allows processing to continue
- Mesoscale Discussion failures handled silently (returns false if no discussions or fetch fails)

## Cross-Cutting Concerns

**Logging:**
- Frontend: Uses `Log.info()` (MagicMirror logging system) for module start message
- Frontend: `console.log()` for SPC data reception confirmation
- Backend: `Log.info()` for node helper initialization and MD array logging
- Backend: `console.log()` for SPC data request details, MD test results, debugging output
- Backend: `console.error()` for fetch errors (in `fetchGeoJson()`)

**Validation:**
- Frontend: Checks data existence with `if (!this.spcrisk)` before rendering
- Frontend: Checks error property with `if (this.spcrisk.error)`
- Frontend: Checks risk categories with conditional rendering (e.g., `if(this.spcrisk.day1.risk != "NONE")`)
- Backend: HTTP response validation with `if(!res.ok)` in `fetchBinBuffer()`
- Backend: Entry existence check in `extractKmlFromKmz()`

**Configuration:**
- Frontend: Default configuration in `defaults` object (lat, lon, extended flag, updateInterval in minutes)
- Frontend: All configuration passed via socket notification to backend
- Backend: No hardcoded locations, all values come from frontend configuration

---

*Architecture analysis: 2026-03-04*
