# Testing Patterns

**Analysis Date:** 2026-03-04

## Test Framework

**Runner:**
- Not currently configured
- ESLint is available but no test runner installed (no Jest, Vitest, Mocha, etc.)
- `package.json` lists only ESLint tools in devDependencies, no testing tools

**Assertion Library:**
- None installed or in use

**Run Commands:**
- Not applicable - no test infrastructure configured
- Manual testing only (likely in MagicMirror environment)

## Test File Organization

**Location:**
- No test files currently in codebase
- No `test/`, `tests/`, `__tests__/`, or `spec/` directories present
- Testing approach: Manual or external testing only

**Naming:**
- Not applicable - no test files exist

**Structure:**
- Not applicable - no test files exist

## Test Coverage

**Requirements:**
- No coverage tools configured
- Not enforced

**Current Status:**
- **No tests** - Critical gap for production code
- Core business logic (geospatial analysis, data fetching, parsing) is untested
- Module integration testing likely done manually in MagicMirror environment

## Testing Gaps & Recommendations

### Unit Test Gaps

**Data Processing Functions (HIGH PRIORITY):**
- `extractPolygons()` - Polygon extraction from GeoJSON features
  - File: `node_helper.js` lines 73-88
  - Test: Should handle Polygon and MultiPolygon types
  - Test: Should apply label and filter callbacks
  - Test: Should handle missing geometry

- `evaluatePolygons()` - Point-in-polygon evaluation
  - File: `node_helper.js` lines 89-98
  - Test: Should find containment in polygons
  - Test: Should apply comparator correctly
  - Test: Should return initial value when no match

- `evaluatePolygonsContinuous()` - Weighted geospatial evaluation
  - File: `node_helper.js` lines 129-152
  - Test: Should weight nearby higher-risk polygons
  - Test: Should decay influence with distance
  - Test: Should handle edge cases (zero distance, no higher risk)

- `percToRisk()` - Probability to risk category conversion
  - File: `node_helper.js` lines 179-186
  - Test: Should map specific percentage thresholds (0.45, 0.30, 0.15, 0.05)
  - Test: Should consider significant flag (isSig parameter)
  - Test: Should return "NONE" for unmapped values

**Data Parsing Functions (HIGH PRIORITY):**
- `extractKmlFromKmz()` - KMZ archive extraction
  - File: `node_helper.js` lines 49-55
  - Test: Should extract KML from valid KMZ
  - Test: Should throw error if KML not found

- `parseNetworkLinks()` - KML parsing for network links
  - File: `node_helper.js` lines 57-64
  - Test: Should extract href values from NetworkLink elements
  - Test: Should handle empty results
  - Test: Should trim whitespace

- `kmlToGeoJson()` - KML to GeoJSON conversion
  - File: `node_helper.js` lines 66-70
  - Test: Should convert valid KML documents
  - Test: Should preserve geometry and properties

**Network Functions (MEDIUM PRIORITY):**
- `fetchBinBuffer()` - Binary data fetching
  - File: `node_helper.js` lines 37-41
  - Test: Should fetch and return buffer on success
  - Test: Should throw on HTTP error (404, 500, etc.)
  - Test: Should handle network failures

- `fetchGeoJson()` - JSON data fetching with error handling
  - File: `node_helper.js` lines 188-198
  - Test: Should fetch and parse JSON
  - Test: Should return null on error (not throw)
  - Test: Should log errors

- `getMesoscaleDiscussion()` - Complex data fetching workflow
  - File: `node_helper.js` lines 154-175
  - Test: Should fetch MD archives and extract applicable discussions
  - Test: Should return false if no active MDs
  - Test: Should check point-in-polygon against MD geometries

### Integration Test Gaps

**Data Flow Tests (MEDIUM PRIORITY):**
- Socket notification handling
  - File: `node_helper.js` lines 25-35
  - Test: Should handle "GET_SPC_DATA" notification
  - Test: Should call `getSpcOutlook()` and `getMesoscaleDiscussion()`
  - Test: Should send "SPC_DATA_RESULT" back to frontend

- Frontend socket communication
  - File: `MMM-SPCOutlook.js` lines 1-26
  - Test: Should send GET_SPC_DATA on start
  - Test: Should handle SPC_DATA_RESULT response
  - Test: Should update DOM on data arrival

- DOM rendering
  - File: `MMM-SPCOutlook.js` lines 34-94
  - Test: Should display loading state before data
  - Test: Should display error state on error
  - Test: Should display "No Severe Weather Risk" when appropriate
  - Test: Should render day-specific risk information
  - Test: Should show tornado/hail/wind risk probabilities when applicable

## Test Types Not Implemented

**Unit Tests:**
- None - High coverage gaps exist
- Should cover: Data conversion, geospatial calculations, error conditions

**Integration Tests:**
- None - Module interactions untested
- Should cover: Socket notifications, data flow, DOM updates

**E2E Tests:**
- None configured
- Manual testing in MagicMirror environment likely used

## Recommended Testing Approach

**Framework Recommendation:**
- Vitest or Jest for unit testing geospatial/data functions
- @testing-library/dom for DOM rendering tests
- Mocha for integration tests if preferred

**Priority Order:**
1. Unit tests for `evaluatePolygons()` and related geospatial functions (risk of incorrect location detection)
2. Unit tests for `percToRisk()` threshold conversion (risk of misclassified alerts)
3. Tests for network functions with mocked fetch
4. DOM rendering tests for frontend module
5. Integration tests for socket communication

**Coverage Target:**
- Data processing: 100% (critical for weather data accuracy)
- Network operations: 80%+ (error cases covered)
- UI rendering: 70%+
- Overall: 80%+

---

*Testing analysis: 2026-03-04*
