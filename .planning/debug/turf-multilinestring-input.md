---
slug: turf-multilinestring-input
status: resolved
trigger: "node_helper crashes fetching/parsing SPC data: @turf/point-to-line-distance throws 'Invalid input to line: must be a LineString, given MultiLineString' at node_helper.js:158 (inside computeProximity loop at line 144)"
created: 2026-05-24
updated: 2026-05-24
---

# Debug: turf-multilinestring-input

## Symptoms

- **Expected behavior:** `computeProximity` iterates SPC outlook features and computes point-to-line distance for each without throwing; SPC data parses successfully.
- **Actual behavior:** `pointToLineDistance` throws because at least one feature passed in is a `MultiLineString` rather than a `LineString`. The error short-circuits the loop / `getSpcOutlook` promise rejects, and the module logs `Error fetching or parsing SPC data`.
- **Error messages:**
  ```
  [2026-05-24 09:41:02.914] [ERROR] [MMM-SPCOutlook] Error fetching or parsing SPC data
  Error: Invalid input to line: must be a LineString, given MultiLineString
      at featureOf (node_modules/@turf/invariant/dist/cjs/index.cjs:69:11)
      at Object.pointToLineDistance (node_modules/@turf/point-to-line-distance/dist/cjs/index.cjs:34:26)
      at node_helper.js:158:24
      at Array.forEach (<anonymous>)
      at Class.computeProximity (node_helper.js:144:11)
      at Class.getSpcOutlook (node_helper.js:528:37)
      at async Class.socketNotificationReceived (node_helper.js:45:23)
  ```
- **Timeline:** Unknown — just noticed in logs today (2026-05-24). Could be tied to SPC publishing a multi-segment outlook polygon outline today.
- **Reproduction:** Triggered automatically when the module fetches the current SPC outlook GeoJSON and one of the features' geometry is a `MultiLineString` (or when a Polygon/MultiPolygon is converted to lines and the conversion yields multiple line segments).

## Current Focus

hypothesis: "CONFIRMED: computeProximity branch at line 155 only handles FeatureCollection (from MultiPolygon) and Feature<LineString> (from simple Polygon). It misses Feature<MultiLineString>, which turf.polygonToLine returns for a Polygon with one or more inner rings (holes). When SPC published a donut-shaped or hole-bearing polygon today, polygonToLine produced Feature<MultiLineString>, which fell through to [line] and crashed pointToLineDistance."
test: "Verified via node REPL: turf.polygonToLine on Polygon-with-hole yields Feature<MultiLineString>; the old branch passed it directly to pointToLineDistance, which threw."
expecting: "FIXED: after patch, turf.flatten decomposes Feature<MultiLineString> into constituent LineStrings before the distance loop."
next_action: "RESOLVED"
reasoning_checkpoint: null
tdd_checkpoint: null

## Evidence

- timestamp: 2026-05-24T09:41:02
  observation: "Error stack points to node_helper.js:158 inside forEach in computeProximity"
  source: "error log"

- timestamp: 2026-05-24
  observation: "turf.polygonToLine behavior verified via REPL: simple Polygon -> Feature<LineString>; Polygon-with-hole -> Feature<MultiLineString>; MultiPolygon -> FeatureCollection<LineString>"
  source: "node REPL (turf v6)"

- timestamp: 2026-05-24
  observation: "node_helper.js line 155 branch: (line.type === 'FeatureCollection') ? line.features : [line] — no handling for Feature<MultiLineString>"
  source: "code read"

- timestamp: 2026-05-24
  observation: "Fix applied: added middle branch using turf.flatten(line).features for Feature<MultiLineString>. Smoke test: all three geometry types now compute distance without throwing."
  source: "code edit + REPL test"

## Eliminated

- "MultiLineString comes directly from SPC GeoJSON" — SPC GeoJSON contains Polygon/MultiPolygon features; the MultiLineString arises from polygonToLine conversion inside the module, not from raw SPC data.
- "Bug introduced by a recent commit" — the branch at line 155 was always incomplete; it worked until today because SPC had not published a polygon with inner rings (holes). Latent bug exposed by new data shape.

## Resolution

root_cause: "turf.polygonToLine returns Feature<MultiLineString> for any Polygon that has one or more inner rings (holes). The lineFeatures branch in computeProximity (node_helper.js:155) only handled FeatureCollection (MultiPolygon case) and Feature<LineString> (simple Polygon), silently falling through to [line] for the hole case and passing a Feature<MultiLineString> directly to pointToLineDistance, which rejects non-LineString input."

fix: "Expanded the lineFeatures ternary in computeProximity (node_helper.js lines 158-162) to add a middle branch: when line.geometry.type === 'MultiLineString', call turf.flatten(line).features to decompose it into an array of Feature<LineString> before iterating. No other call sites changed; turf.flatten is already available via @turf/turf."

files_changed:
  - node_helper.js (lines 154-162 — lineFeatures branch in computeProximity)
