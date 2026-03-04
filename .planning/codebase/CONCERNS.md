# Codebase Concerns

**Analysis Date:** 2026-03-04

## Tech Debt

**Inconsistent Variable Declaration:**
- Issue: Mix of `var`, `let`, and `const` with many variables undeclared, creating global scope pollution
- Files: `node_helper.js` (throughout), `MMM-SPCOutlook.js` (lines 35, 48, 59, 70, 79)
- Impact: Variables leak into global scope, risk of naming conflicts, harder to track state, potential memory leaks
- Fix approach: Declare all variables with `const` or `let` consistently; no undeclared variables

**Over-reliance on Commented Code:**
- Issue: Large blocks of commented-out code (lines 258-263, 554-627) cluttering implementation
- Files: `node_helper.js`
- Impact: Increases maintenance burden, obscures actual logic flow, creates confusion about what's active
- Fix approach: Remove commented code blocks; commit alternative implementations to git history instead

**Excessive console.log Statements in Production:**
- Issue: Debug logging left in code (lines 12, 21, 169 in MMM-SPCOutlook.js and node_helper.js)
- Files: `MMM-SPCOutlook.js` (lines 12, 21), `node_helper.js` (line 169)
- Impact: Output pollutes logs, can degrade performance when logging large objects like GeoJSON
- Fix approach: Remove debug console.log calls; use Log.info/Log.error consistently

**Repeated GeoJSON Fetching Logic:**
- Issue: Days 1-2 fetch and process risk types with nearly identical code repeated 6 times (Tornado, Hail, Wind)
- Files: `node_helper.js` (lines 265-296 for Day1, 310-341 for Day2)
- Impact: Difficult to maintain, increases bug surface area, violates DRY principle
- Fix approach: Extract into reusable function that handles all three hazard types

## Known Bugs

**Arrow Function Syntax Error on Lines 272 and 283:**
- Symptoms: `label => label => label` creates a double-arrow function that returns a function, not a label
- Files: `node_helper.js` (lines 272, 283, 317, 327, 339, 361, 408, 419, 430, 441, 452)
- Trigger: When Day1/Day2 Tornado/Hail/Wind SIGN risk is greater than 0
- Impact: SIGN detection fails; warning indicators not displayed for tornado/hail/wind on Days 1-2
- Current code example: `label => label => label` should be `label => label`

**Uninitialized Variable in evaluatePolygonsWeighted:**
- Symptoms: Variable `result` used on line 106 without being assigned in the function
- Files: `node_helper.js` (line 106)
- Trigger: If this function is called (currently unused but defined)
- Impact: Runtime error if this function is invoked; logic error in weighted risk calculation
- Workaround: Function not currently used; evaluatePolygonsContinuous is the active weighted function

**Day 8 Risk Assignment Error:**
- Symptoms: Day 8 displays Day 7 risk value; day 8 risk is calculated but not returned correctly
- Files: `node_helper.js` (line 522)
- Trigger: When extended=true and viewing Day 8 forecast
- Code: `"risk": day7Risk` should be `"risk": day8Risk`
- Impact: Day 8 shows wrong risk category (shows Day 7 instead of calculated Day 8)

**Day 8 Data Mismatch in Return Object:**
- Symptoms: Day 8 returns mixed data from Day 7 and Day 8
- Files: `node_helper.js` (lines 521-527)
- Trigger: When extended=true
- Code: probRisk and sign use day7 values, but text uses day8Risk
- Impact: Display shows inconsistent data for Day 8

**Logic Error in day48Risk Assignment:**
- Symptoms: Variable `day48Risk` set to false regardless of risk values
- Files: `node_helper.js` (line 458)
- Trigger: Every call with extended=true
- Code: Checks `day4ProbRisk` five times instead of checking days 4-8
- Impact: Extended forecast always reports no Day 4-8 risk even when risk exists
- Fix: Should check `day4ProbRisk || day5ProbRisk || day6ProbRisk || day7ProbRisk || day8ProbRisk`

**Mesoscale Discussion Logic Flaw:**
- Symptoms: Function only returns first matching MD; ignores additional overlapping discussions
- Files: `node_helper.js` (line 162)
- Trigger: Location in area with multiple active mesoscale discussions
- Code: Loop processes all URLs but `checkInPolygon()` returns immediately on first feature
- Impact: Users only see first matching MD, missing relevant overlapping discussions
- Fix approach: Refactor to check all features in all URLs and collect all matches

## Security Considerations

**No Network Timeout Configuration:**
- Risk: Fetch requests to NOAA servers can hang indefinitely if connection is lost
- Files: `node_helper.js` (lines 37-40, 188-197)
- Current mitigation: Basic error handling in fetchGeoJson, but no timeout set
- Recommendations:
  - Add timeout parameter to fetch calls (e.g., 10 second timeout)
  - Implement retry logic with exponential backoff
  - Add circuit breaker for repeated failures

**No Input Validation for Coordinates:**
- Risk: lat/lon from config used directly in point creation without validation
- Files: `MMM-SPCOutlook.js` (lines 13), `node_helper.js` (line 249)
- Current mitigation: None
- Recommendations:
  - Validate lat is between -90 and 90
  - Validate lon is between -180 and 180
  - Return user-friendly error if invalid

**Unvalidated External GeoJSON:**
- Risk: GeoJSON from NOAA APIs not validated before use with Turf.js
- Files: `node_helper.js` (lines 254-455)
- Current mitigation: Try/catch wraps getSpcOutlook
- Recommendations:
  - Add schema validation for GeoJSON structure
  - Handle malformed features gracefully
  - Log unexpected data formats for debugging

## Performance Bottlenecks

**Sequential Fetching of Multiple GeoJSON Files:**
- Problem: Days 1-2 fetch 7 URLs sequentially (cat + 3 hazards each), Days 3+ fetch individually
- Files: `node_helper.js` (lines 254-362, 403-455)
- Cause: Await statements in loop without Promise.all
- Impact: Data fetch time is sum of all requests (minimum 8+ sequential requests for full data)
- Improvement path:
  - Group URLs for same day and fetch in parallel with Promise.all
  - Example: `Promise.all([fetchGeoJson(day1CatURL), fetchGeoJson(day1TorURL), ...])`
  - Could reduce fetch time from 10+ seconds to ~2 seconds

**Repeated Polygon Extraction for SIGN Features:**
- Problem: Fetches same GeoJSON, extracts all features, then re-extracts with different filter
- Files: `node_helper.js` (lines 271-273, 282-284, etc.)
- Cause: Two separate `extractPolygons()` calls on same geojson for "all" vs "SIGN only"
- Impact: Extra parsing work, redundant iteration
- Improvement path: Extract once, partition into two arrays in single pass

**Point-in-Polygon Calculations Without Caching:**
- Problem: For each location update, recalculates all polygon intersections
- Files: `node_helper.js` (lines 254-455)
- Cause: No caching of results between update intervals
- Impact: Unused computation if user doesn't move; full recalc every 60 minutes
- Improvement path: Cache results with location hash; only recalculate if location changes beyond threshold

## Fragile Areas

**GeoJSON Feature Property Access:**
- Files: `node_helper.js` (lines 77, 267-268, 361, etc.)
- Why fragile: Assumes LABEL property exists and has specific format; no existence checks
- Safe modification: Always check property existence: `f.properties?.LABEL || ""`
- Test coverage: No unit tests for malformed GeoJSON

**SIGN Feature Detection Logic:**
- Files: `node_helper.js` (lines 271-273, 282-284, 317-318, 327-330, 339-340, 361-362, 408-410, 419-421, 430-432, 441-443, 452-454)
- Why fragile: Duplicated condition checking repeated 11+ times with copy-paste errors evident
- Safe modification: Create shared function for SIGN detection that takes geojson and returns boolean
- Test coverage: No tests for SIGN flag handling

**DOM/XML Parsing Error Handling:**
- Files: `node_helper.js` (lines 58-68, 154-170)
- Why fragile: DOMParser.parseFromString doesn't throw on malformed XML; creates error nodes silently
- Safe modification: Validate parsed document for errors before using xpath/kml conversion
- Test coverage: No tests for malformed KML responses

**Turf.js Geometry Handling:**
- Files: `node_helper.js` (lines 82-84, 135, 267, etc.)
- Why fragile: Code assumes feature geometry exists and is either Polygon or MultiPolygon
- Safe modification: Add validation: `if (!feature.geometry || !['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) return`
- Test coverage: No tests for unexpected geometry types

## Scaling Limits

**Single-Point Location Model:**
- Current capacity: One lat/lon per module instance
- Limit: Can't handle regional monitoring (e.g., entire state or service area)
- Scaling path: Refactor to support array of locations, return risks for each point

**No Caching of SPC Data:**
- Current capacity: Refetches all 8-15 GeoJSONs every 60 minutes
- Limit: Scales poorly with multiple module instances; wastes bandwidth
- Scaling path: Implement server-side cache with ETag/Last-Modified headers to avoid re-downloading unchanged data

**Memory Usage of GeoJSON in Memory:**
- Current capacity: Stores full GeoJSON features in memory during processing
- Limit: Large outbreak days with complex polygons could consume significant RAM
- Scaling path: Stream-process features instead of holding full objects

## Dependencies at Risk

**node-fetch 2.6.1 - EOL Soon:**
- Risk: Version 2.x is maintenance-only; latest is 3.x with breaking changes
- Impact: Security patches may stop; unable to upgrade Node.js if new versions require fetch 3.x
- Current code: Uses dynamic import pattern for ESM compatibility
- Migration plan: Plan upgrade to node-fetch 3.x or migrate to native fetch (Node 18+)

**@xmldom/xmldom - Minimal Maintenance:**
- Risk: XML parsing library with infrequent updates; DOM parser quirks undocumented
- Impact: Malformed XML from NOAA could cause unexpected parsing behavior
- Current mitigation: Wraps in try/catch
- Recommendations: Consider xml2js or sax-like approach for more robust error handling

**@tmcw/togeojson - Inactive:**
- Risk: Library appears unmaintained; hasn't been updated in years
- Impact: KML to GeoJSON conversion may have edge cases that won't be fixed
- Current usage: Critical path for converting SPC KML to usable features
- Recommendations: Monitor for KML format changes from NOAA; be prepared to fork or find alternative

## Missing Critical Features

**No Data Validation/Verification:**
- Problem: No validation that returned risk data makes sense (e.g., Day 4+ always has both probRisk and text, colors match risks)
- Blocks: Can't confidently detect corrupt data from SPC servers
- Recommendation: Add validation schema that checks for consistency and reports anomalies

**No Offline/Fallback Mode:**
- Problem: Complete dependency on network; no cached last-good-values
- Blocks: Module shows "Loading..." when network is down; no stale data shown
- Recommendation: Cache last successful response; show with "as of X minutes ago" indicator

**No Configuration Validation:**
- Problem: Invalid lat/lon silently accepted and create bad point geometry
- Blocks: Users don't know configuration is broken until runtime
- Recommendation: Validate config at module start; log clear error message

## Test Coverage Gaps

**No Unit Tests:**
- What's not tested: All parsing/extraction functions (extractPolygons, evaluatePolygons, percToRisk)
- Files: `node_helper.js`
- Risk: Logic errors like the arrow function bug and variable assignment bugs go undetected
- Priority: High - Core business logic is untested

**No Integration Tests:**
- What's not tested: Full data flow from fetch through display
- Files: Both files
- Risk: Can't catch data corruption or API changes until user reports issues
- Priority: High - Should test against real NOAA data monthly

**No GeoJSON Edge Case Testing:**
- What's not tested: Handling of malformed GeoJSON, missing properties, unexpected geometry types
- Files: `node_helper.js` (lines 73-88, 134-152)
- Risk: Undefined behavior if NOAA API returns unexpected format
- Priority: Medium - Should have defensive tests for robustness

---

*Concerns audit: 2026-03-04*
