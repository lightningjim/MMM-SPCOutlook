# Coding Conventions

**Analysis Date:** 2026-03-04

## Naming Patterns

**Files:**
- Main module: `MMM-SPCOutlook.js` - Follows MagicMirror naming convention with uppercase prefix and hyphenated name
- Helper files: `node_helper.js` - Lowercase with underscore separation

**Functions:**
- Camel case: `socketNotificationReceived()`, `fetchBinBuffer()`, `extractKmlFromKmz()`
- Arrow functions used for callbacks and lambdas: `loc => { ... }`, `items.forEach(({label, value, poly}) => { ... })`
- No function prefixes or suffixes for visibility (all module-level code)

**Variables:**
- Local variables: camelCase (`geojson`, `day1RiskPoly`, `probRiskHTML`)
- Constants/Maps: camelCase (`riskToValue`, `riskToColor`, `valueToFullRisk`)
- Module state: this.property pattern (`this.spcrisk`, `this.mds`, `this.name`, `this.config`)
- Temporary/loop variables: often single letter or abbreviated (`d`, `w`, `pt` for point, `f` for feature)
- Some variables declared without `const`/`var` at module scope, creating implicit globals (see CONCERNS.md)

**Types:**
- Objects use descriptive property names with dot notation: `day1.risk`, `day1.text`, `day1.color`
- GeoJSON objects reused with minimal naming: `geojson` variable reused across multiple fetch operations
- Comparator objects: `catComparator`, `percComparator`, `sigComparator` with `initial` and `comparator` properties

## Code Style

**Formatting:**
- No automated formatter configured (no Prettier, no `.prettierrc`)
- 2-space indentation (observed in module.exports and nested functions)
- No strict line length enforcement
- Inline comments use `//` format
- Block comments minimal or absent

**Linting:**
- ESLint installed in devDependencies (`@eslint/js`, `eslint`, `typescript-eslint`)
- No `.eslintrc` configuration file present - using default ESLint configuration
- Configuration needed: ESLint is included but not actively configured for the project

**Code Quality:**
- Mix of `var`, `function`, and arrow functions (not enforcing consistency)
- Some variables declared without const/var, creating implicit globals
- Long functions with multiple responsibilities (e.g., `getSpcOutlook` is 330+ lines)
- Repetitive patterns for Day 1-8 handling without abstraction

## Import Organization

**Module Loading:**
```javascript
const NodeHelper = require("node_helper");
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
const turf = require("@turf/turf");
const Log = require("logger");
const ZIP = require("adm-zip");
const { DOMParser } = require("@xmldom/xmldom");
const KMLtoGJ = require("@tmcw/togeojson");
const xpath = require("xpath");
```

**Order:**
1. Core dependencies (NodeHelper, fetch)
2. Utility libraries (turf, Log, ZIP)
3. Data parsing (DOMParser, KMLtoGJ, xpath)

**MagicMirror Specific:**
- Uses `Module.register()` for frontend: `Module.register("MMM-SPCOutlook", { ... })`
- Uses `NodeHelper.create()` for backend: `module.exports = NodeHelper.create({ ... })`
- Methods override MagicMirror lifecycle: `start()`, `getDom()`, `getStyles()`, `socketNotificationReceived()`

## Error Handling

**Patterns:**
- Try/catch blocks used in async operations: `try { ... } catch (err) { ... }`
- Error logging: `Log.error("MMM-SPCOutlook fetchGeoJson error:", err);`
- Console logging also used: `console.log()`, `console.error()`
- Error objects returned in response objects: `{ error: err.toString() }`
- No custom error types or error classes
- Silent failures in some cases (e.g., `checkInPolygon` returns `undefined` if no features match)

**HTTP Errors:**
- Fetch error checking: `if(!res.ok) throw new Error(...)`
- Network failures handled with try/catch

## Logging

**Framework:** Native console and MagicMirror Log module

**Patterns:**
- Debug/info: `Log.info("message")` for important lifecycle events
- Development logging: `console.log("SPC-Outlook: ...")` for data flow tracking
- Error logging: `Log.error()` for error conditions
- Commented-out logging: Many `//Log.info()` lines indicate development-stage logging

**Guidelines:**
- Use `Log.info()` for module startup/lifecycle
- Use `console.log()` for temporary debugging (many examples in code)
- Include context prefix: `"SPC-Outlook: "` or `"MMM-SPCOutlook "`

## Comments

**When to Comment:**
- Minimal comments in codebase
- Comments used for:
  - Grouping logical sections: `// Day 1`, `// Day 2`
  - Explaining complex operations: `// Tor SIGN, reuse GEOJSON`
  - Marking temporary code: `//testing Continious decay;`, `//testing Weighted Average;`
  - Inline clarifications in compact code

**Commented Code:**
- Large blocks of commented code (lines 554-627) - old implementations kept for reference
- Indicates iterative development without full cleanup

## Function Design

**Size:**
- Functions range from 3 lines (simple helpers) to 330+ lines (data processing)
- `getSpcOutlook()` is excessively long and should be refactored
- Most helper functions under 20 lines are appropriately sized

**Parameters:**
- Named parameters in object destructuring: `const { lat, lon, extended } = payload;`
- Arrow function parameter patterns: `({label, value, poly}) => { ... }`
- Comparator pattern uses object parameters: `evaluatePolygons(items, loc, comparator)`
- No type annotations (vanilla JavaScript, no TypeScript)

**Return Values:**
- Implicit returns in arrow functions: `label => riskToValue[label] || 0`
- Object literals for complex returns: day objects with multiple properties
- Null/false returns for empty cases: `return false;` or `return null;`
- Undefined returns (implicit) in some functions with conditional logic

## Module Design

**Exports:**
- MagicMirror modules: `Module.register()` returns nothing, modifies global Module object
- Node helper: `module.exports = NodeHelper.create({ ... })`
- No barrel files or re-exports
- Single responsibility per file: frontend module and node helper separated

**Scope:**
- MagicMirror Module.register uses `this` context for instance state
- NodeHelper methods use `this` for module state and method references
- Isolated scope prevents global pollution in MagicMirror environment
- Helper functions defined as methods on module object, not standalone

---

*Convention analysis: 2026-03-04*
