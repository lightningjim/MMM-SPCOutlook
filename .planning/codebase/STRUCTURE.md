# Codebase Structure

**Analysis Date:** 2026-03-04

## Directory Layout

```
MMM-SPCOutlook/
├── MMM-SPCOutlook.js       # Frontend module for MagicMirror
├── node_helper.js          # Backend server logic for data fetching and processing
├── package.json            # Project metadata and dependencies
├── LICENSE                 # MIT license
├── README.md               # Project overview
├── screenshot1.png         # Usage example screenshot
└── node_modules/           # Installed dependencies (generated)
```

## Directory Purposes

**Root Directory:**
- Purpose: Module root - contains all source code, config, and assets
- Contains: Source files, package manifest, documentation, license
- Key files: `MMM-SPCOutlook.js`, `node_helper.js`, `package.json`

**node_modules/ (Generated):**
- Purpose: NPM-installed dependencies
- Generated: Yes
- Committed: No (included in .gitignore)
- Contains: @tmcw/togeojson, @turf/turf, @xmldom/xmldom, adm-zip, node-fetch, weather-icons, xpath

## Key File Locations

**Entry Points:**

- `MMM-SPCOutlook.js`: Frontend module entry point
  - Registers module with MagicMirror framework
  - Triggers via MagicMirror when module is loaded on display
  - Exports module configuration, start function, DOM rendering function
  - Primary exports: `Module.register()` call with module name and object containing lifecycle methods

- `node_helper.js`: Backend server entry point
  - Creates NodeHelper instance using MagicMirror NodeHelper pattern
  - Listens for socket notifications from frontend module
  - Exports module.exports assignment to NodeHelper.create() return value
  - Runs as separate Node.js process spawned by MagicMirror

**Configuration:**

- `package.json`: NPM package manifest
  - Contains version (1.0.0), description, author, license
  - Lists all dependencies required for execution
  - Defines `start` script (runs node_helper.js directly, though MagicMirror manages this)

**Documentation:**

- `README.md`: Project documentation
  - Brief description of module purpose
  - Screenshot reference for usage

**Assets:**

- `screenshot1.png`: Screenshot showing output with 3-day risk display
  - Demonstrates visual output of module on MagicMirror display

## Naming Conventions

**Files:**
- `MMM-[ModuleName].js` pattern: Frontend module file follows MagicMirror naming convention
- `node_helper.js`: Fixed backend helper filename (MagicMirror standard)
- `package.json`: Standard NPM package manifest filename

**Functions:**
- camelCase: All functions use camelCase (e.g., `fetchBinBuffer`, `extractKmlFromKmz`, `evaluatePolygons`)
- Descriptive verbs: Function names start with action verbs (fetch, extract, parse, evaluate, check)
- Domain-specific prefixes: Geographic/spatial functions use clear domain terms (Polygon, GeoJson, Kml)

**Variables:**
- camelCase: Local variables and module properties use camelCase (e.g., `geojson`, `riskToValue`, `day1Risk`)
- Abbreviations: Common abbreviations used (e.g., `lat`/`lon` for latitude/longitude, `Tor` for tornado, `Sig` for significant)
- Numeric suffixes: Day references use numeric suffixes (e.g., `day1Risk`, `day2TorSign`, `day3ProbRisk`)

**Types/Objects:**
- PascalCase for comparator objects (e.g., `catComparator`, `percComparator`, `sigComparator`) - actually camelCase but logically grouping-focused
- Data structure property names follow camelCase (e.g., `probRisk`, `torRisk`, `windRisk`)

## Where to Add New Code

**New Feature (Additional Risk Type or Day):**
- Primary code: Add logic in `getSpcOutlook()` function in `node_helper.js`
  - Follow pattern: fetch GeoJSON URL → extract polygons → evaluate with location → map to risk value
  - Return additional day object in return statement
- Frontend display: Add rendering logic in `getDom()` function in `MMM-SPCOutlook.js`
  - Check if data exists (`if(this.spcrisk.dayX.risk != "NONE")`)
  - Append HTML with proper formatting and color coding

**New Geospatial Evaluation Method:**
- Implementation: Add new function to `node_helper.js` alongside existing `evaluatePolygons*()` methods
  - Follow naming pattern: `evaluate[Adjective]Polygons()`
  - Accept parameters: items (polygon array), loc (Turf point), comparator (evaluation strategy)
  - Return computed risk value
- Integration: Call new method instead of existing evaluation in `getSpcOutlook()` risk computation steps

**New Data Source (Non-NOAA):**
- Backend handling: Add new fetch method following pattern of `getMesoscaleDiscussion()` or `getSpcOutlook()`
- Frontend integration: Add socket notification handler for new data type in `socketNotificationReceived()`
- State storage: Add new property to `this` object in frontend (e.g., `this.customData = payload`)

**Utility Functions:**
- Location: Add to `node_helper.js` if they perform geospatial or data transformation operations
- Export: Add to module.exports object if needs to be shared (not needed - all helpers are internal)

## Special Directories

**node_modules/:**
- Purpose: Contains all npm dependencies
- Generated: Yes - created via `npm install`
- Committed: No - listed in .gitignore
- Contains: Turf.js geospatial library, XML DOM parsing (@xmldom), KML-to-GeoJSON converter (@tmcw/togeojson), ZIP file reader (adm-zip), HTTP client (node-fetch), weather icons CSS, XPath query library

**.planning/codebase/ (Generated):**
- Purpose: Stores codebase analysis documents
- Generated: Yes - created by GSD tools
- Committed: Yes - part of planning infrastructure
- Contains: ARCHITECTURE.md, STRUCTURE.md, and other analysis documents

## Code Organization Patterns

**Backend (node_helper.js) Organization:**

1. **Import/Require Statements** (lines 1-11): All external dependencies and internal module setup
2. **Mapping Objects** (lines 12-17): Risk value/category mapping dictionaries used throughout module
3. **Helper Methods** (lines 37-99): Utility functions for data extraction and geospatial operations
   - KMZ/KML handling: `fetchBinBuffer()`, `kmzToKmlfilename()`, `extractKmlFromKmz()`, `parseNetworkLinks()`, `kmlToGeoJson()`
   - Polygon operations: `extractPolygons()`, `evaluatePolygons()`, `evaluatePolygonsContinuous()`, `evaluatePolygonsWeighted()`
4. **Main Service Methods** (lines 154-534): High-level operations
   - `getMesoscaleDiscussion()`: Orchestrates MD fetching and location checking
   - `getSpcOutlook()`: Main orchestration function for all day-by-day risk computation
   - `fetchGeoJson()`: Common HTTP fetch wrapper with error handling
5. **Socket Notification Handler** (lines 25-34): Entry point for requests from frontend

**Frontend (MMM-SPCOutlook.js) Organization:**

1. **Module Registration** (line 1): `Module.register()` call with module name
2. **Module Configuration** (lines 2-7): `defaults` object with configuration options
3. **Lifecycle Methods** (lines 9-15): `start()` function for initialization and interval setup
4. **Socket Communication** (lines 18-26): `socketNotificationReceived()` handler for data updates
5. **Style Definition** (lines 28-31): `getStyles()` function for CSS dependencies
6. **DOM Rendering** (lines 34-94): `getDom()` function with all HTML generation logic
   - Includes inline helper function `dowToText()` for day-of-week formatting
   - Conditional rendering based on data state (loading, error, no risk, has risk)
   - Day-by-day risk rendering with probability risk details for Days 1-2
   - Extended forecast rendering (Days 4-8) when enabled

---

*Structure analysis: 2026-03-04*
