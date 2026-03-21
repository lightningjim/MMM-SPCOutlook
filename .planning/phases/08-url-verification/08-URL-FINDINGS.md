# Phase 8: URL Verification Findings

**Verified:** 2026-03-21
**Requirement:** FWXT-05

## Endpoint Verification

| URL | HTTP Status | Verified |
|-----|-------------|----------|
| `https://www.spc.noaa.gov/products/exper/fire_wx/day3fw_windrhcat.lyr.geojson` | 200 | YES |
| `https://www.spc.noaa.gov/products/exper/fire_wx/day3fw_drytcat.lyr.geojson` | 200 | YES |
| `https://www.spc.noaa.gov/products/exper/fire_wx/day4fw_windrhcat.lyr.geojson` | 200 | YES |
| `https://www.spc.noaa.gov/products/exper/fire_wx/day4fw_drytcat.lyr.geojson` | 200 | YES |
| `https://www.spc.noaa.gov/products/exper/fire_wx/day5fw_windrhcat.lyr.geojson` | 200 | YES |
| `https://www.spc.noaa.gov/products/exper/fire_wx/day5fw_drytcat.lyr.geojson` | 200 | YES |
| `https://www.spc.noaa.gov/products/exper/fire_wx/day6fw_windrhcat.lyr.geojson` | 200 | YES |
| `https://www.spc.noaa.gov/products/exper/fire_wx/day6fw_drytcat.lyr.geojson` | 200 | YES |
| `https://www.spc.noaa.gov/products/exper/fire_wx/day7fw_windrhcat.lyr.geojson` | 200 | YES |
| `https://www.spc.noaa.gov/products/exper/fire_wx/day7fw_drytcat.lyr.geojson` | 200 | YES |
| `https://www.spc.noaa.gov/products/exper/fire_wx/day8fw_windrhcat.lyr.geojson` | 200 | YES |
| `https://www.spc.noaa.gov/products/exper/fire_wx/day8fw_drytcat.lyr.geojson` | 200 | YES |

**Result:** All 12 returned HTTP 200

## Confirmed URL Pattern

Base path: `https://www.spc.noaa.gov/products/exper/fire_wx/`
Pattern: `day{N}fw_{type}cat.lyr.geojson` where N=3-8, type=windrh|dryt
Source: SPC GIS page (https://www.spc.noaa.gov/gis/) + live verification 2026-03-21

## Schema Confirmation

### Inspected Files

- `day3fw_windrhcat.lyr.geojson` — 1 feature, DN=8 (Critical active on Day 3)
- `day3fw_drytcat.lyr.geojson` — 1 feature, DN=0 (Predictability Too Low)
- `day4fw_windrhcat.lyr.geojson` — 1 feature, DN=0 (Predictability Too Low)
- `day6fw_windrhcat.lyr.geojson` — 1 feature, DN=8 (Critical active on Day 6)

### Properties — Active Risk Feature (day3fw_windrhcat)

```json
{
  "DN": 8,
  "VALID": "202603221200",
  "EXPIRE": "202603231200",
  "ISSUE": "202603202039",
  "VALID_ISO": "2026-03-22T12:00:00+00:00",
  "EXPIRE_ISO": "2026-03-23T12:00:00+00:00",
  "ISSUE_ISO": "2026-03-20T20:39:00+00:00",
  "FORECASTER": "Squitieri",
  "LABEL": "D3",
  "LABEL2": "Day 3 Critical Risk",
  "stroke": "#CC00CC",
  "fill": "#EE99EE"
}
```

### Properties — No Risk Feature ("Predictability Too Low")

```json
{
  "DN": 0,
  "LABEL": "Predictability Too Low",
  "LABEL2": "",
  "stroke": "",
  "fill": ""
}
```

### Critical Finding: Parse via DN, not LABEL

- `LABEL` values in Day 3-8: `"D3"`, `"D6"`, `"Predictability Too Low"` — NOT `"ELEV"`/`"CRIT"`/`"EXTM"`
- The existing `fireRiskToValue[label]` mapper returns 0 for every Day 3-8 feature — it does not recognize these label values
- `DN` values: 0 (no risk), 5 (Elevated), 8 (Critical), 10 (Extremely Critical)
- DN encoding matches Day 1-2 exactly; DN=8 confirmed live in Day 3-8 data

### DN-to-Risk Mapping (confirmed)

| DN | Risk Level | Integer Value |
|----|------------|---------------|
| 0  | None / Predictability Too Low | 0 |
| 5  | Elevated | 1 |
| 8  | Critical | 2 |
| 10 | Extremely Critical | 3 |

DN=8 confirmed live (day3fw_windrhcat, day6fw_windrhcat). DN=5 and DN=10 inferred from Day 1-2 confirmed schema — HIGH confidence match.

### Geometry Behavior

| Condition | geometry.type | extractPolygons outcome |
|-----------|---------------|------------------------|
| Active risk (DN > 0) | `MultiPolygon` | Polygons extracted normally — same as Day 1-2 |
| No risk (DN = 0) | `GeometryCollection { geometries: [] }` | Filtered by extractPolygons line 89 (`else return`) |

Both DN=0 value check and GeometryCollection geometry type independently guard against false positives.

## Phase 9 Implementation Directives

1. **URL constants:** use `day{N}fw_windrhcat.lyr.geojson` and `day{N}fw_drytcat.lyr.geojson` — NOT `day{N}fw_windrh.lyr.geojson` (returns 404)
2. **Parse strategy:** use `f.properties.DN` via `dnToFireValue` mapper — do NOT use `f.properties.LABEL` (returns day identifier "D3"/"D6", not risk level)
3. **Extend `extractPolygons` signature:** change `toValue(label)` to `toValue(label, feature)` — one-line backward-compatible change; all existing callers unaffected (they ignore the second argument)
4. **Day 3-8 call site:**
   ```javascript
   const dnToFireValue = { 5: 1, 8: 2, 10: 3 };
   const polys = this.extractPolygons(
     fetchResult.data,
     (label, f) => dnToFireValue[f.properties.DN] || 0,
     (label, val) => val > 0
   );
   ```
5. **"Predictability Too Low" features:** DN=0 maps to 0 automatically; `GeometryCollection` geometry also filtered by `extractPolygons` — no special handling needed

## Eliminated URL Patterns (do not use)

| Pattern | Result |
|---------|--------|
| `day{N}fw_windrh.lyr.geojson` | HTTP 404 — all 12 |
| `day{N}fw_dryt.lyr.geojson` | HTTP 404 — all 12 |
| `day{N}fw_cat.lyr.geojson` | HTTP 404 — all 6 |
| `day{N}_windrh.lyr.geojson` (no 'fw') | HTTP 404 — all |
