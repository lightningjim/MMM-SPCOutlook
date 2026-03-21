# Phase 8: URL Verification — Research

**Researched:** 2026-03-21
**Domain:** SPC Day 3–8 fire weather GeoJSON endpoint discovery and schema inspection
**Confidence:** HIGH — all findings based on live HTTP checks and direct GeoJSON inspection performed 2026-03-21

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FWXT-05 | Live endpoint URL verification performed and documented before fetch code is written | All 12 URLs live-checked; schema inspected; findings documented in this artifact |
</phase_requirements>

---

## Summary

Phase 8 is a verification gate, not a code phase. The entire deliverable is confirmed URLs and schema documentation for Phase 9 to consume. This research IS the phase deliverable.

**Live verification results (2026-03-21):**

- Option A hypothesis (`day3fw_windrh.lyr.geojson`) — **ALL 12 returned HTTP 404.** Do not use.
- Confirmed URL pattern: `day{N}fw_windrhcat.lyr.geojson` and `day{N}fw_drytcat.lyr.geojson` — **ALL 12 returned HTTP 200.**

**Critical schema finding:** The `LABEL` property in Day 3–8 categorical GeoJSON is NOT `ELEV/CRIT/EXTM`. It is `D3`, `D6`, `Predictability Too Low`, etc. The existing `fireRiskToValue[label]` mapper returns 0 for every extended fire weather feature. Phase 9 MUST parse via `DN` value instead, using the same DN→risk mapping that Day 1–2 use (DN=5→ELEV→1, DN=8→CRIT→2, DN=10→EXTM→3).

**Primary recommendation:** Phase 9 uses `day{N}fw_windrhcat.lyr.geojson` and `day{N}fw_drytcat.lyr.geojson` at `/products/exper/fire_wx/`. Parsing must use `f.properties.DN` not `f.properties.LABEL`. The `extractPolygons` toValue function needs a new `dnToFireValue` mapper instead of `fireRiskToValue[label]`.

---

## Confirmed URL Pattern

### Authoritative Source

The SPC GIS page (`https://www.spc.noaa.gov/gis/`) documents the canonical URL pattern verbatim:

```
www.spc.noaa.gov/products/exper/fire_wx/day[3,4,5,6,7,8]fw_[drycat,dryprob,windrhcat,windrhprob].[lyr,nolyr].geojson
```

The module uses `.lyr.geojson` (layered, same as Day 1–2 endpoints).

### Live HTTP Verification Results (2026-03-21)

| URL | HTTP Status | Verified |
|-----|-------------|---------|
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

### Eliminated Hypotheses

| Pattern | Result | Notes |
|---------|--------|-------|
| `day{N}fw_windrh.lyr.geojson` (Option A) | HTTP 404 — all 12 | Primary hypothesis from prior research — does not exist |
| `day{N}fw_dryt.lyr.geojson` (Option A) | HTTP 404 — all 12 | Same |
| `day{N}fw_cat.lyr.geojson` (Option B) | HTTP 404 — all 6 | Single-file hypothesis — does not exist |
| `day{N}_windrh.lyr.geojson` (no 'fw') | HTTP 404 — all | |
| `/products/fire_wx/day{N}fw_*` (Day 1–2 path) | Not checked — documented absent in PITFALLS.md | |

---

## Confirmed GeoJSON Schema

### Inspected Files (live, 2026-03-21)

- `day3fw_windrhcat.lyr.geojson` — 1 feature, DN=8 (Critical active on Day 3)
- `day3fw_drytcat.lyr.geojson` — 1 feature, DN=0 (Predictability Too Low)
- `day4fw_windrhcat.lyr.geojson` — 1 feature, DN=0 (Predictability Too Low)
- `day6fw_windrhcat.lyr.geojson` — 1 feature, DN=8 (Critical active on Day 6)

### Live Feature Example (active risk: day3fw_windrhcat)

```json
{
  "type": "Feature",
  "geometry": { "type": "MultiPolygon", "coordinates": [...] },
  "properties": {
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
}
```

### Live Feature Example (no risk: "Predictability Too Low")

```json
{
  "type": "Feature",
  "geometry": { "type": "GeometryCollection", "geometries": [] },
  "properties": {
    "DN": 0,
    "LABEL": "Predictability Too Low",
    "LABEL2": "",
    "stroke": "",
    "fill": ""
  }
}
```

### Critical Schema Differences vs Day 1–2

| Property | Day 1–2 | Day 3–8 Categorical | Impact |
|----------|---------|---------------------|--------|
| `LABEL` | `"ELEV"`, `"CRIT"`, `"EXTM"` | `"D3"`, `"D6"`, `"Predictability Too Low"` | **BREAKS existing `fireRiskToValue[label]` mapper — returns 0 for all features** |
| `LABEL2` | `"Critical Fire Risk"` | `"Day 3 Critical Risk"` | Human-readable only, not parse target |
| `DN` | 5, 8, 10 | **Same: 5, 8, 10** (same risk level encoding) | Parse via DN; same values as Day 1–2 |
| Geometry (no-risk) | Empty FeatureCollection (0 features) | Single Feature with `GeometryCollection { geometries: [] }` | `extractPolygons` handles correctly — `f.geometry.type` is `GeometryCollection`, not `Polygon`/`MultiPolygon`, so line 89 (`else return`) fires |
| Geometry (with risk) | `MultiPolygon` | `MultiPolygon` | Same — turf handles identically |

### DN Value Mapping (confirmed matches Day 1–2)

| DN | Risk Level | fireRiskToValue equivalent | Phase 9 mapper |
|----|------------|---------------------------|----------------|
| 0 | None / Predictability Too Low | 0 | `dnToFireValue[0]` → 0 |
| 5 | Elevated | `ELEV` → 1 | `dnToFireValue[5]` → 1 |
| 8 | Critical | `CRIT` → 2 | `dnToFireValue[8]` → 2 |
| 10 | Extremely Critical | `EXTM` → 3 | `dnToFireValue[10]` → 3 |

DN=8 confirmed live (day3fw_windrhcat, day6fw_windrhcat). DN=5 and DN=10 not observed in today's issuance but match the Day 1–2 pattern confirmed from `day1fw_windrh.lyr.geojson` (DN=5 LABEL='ELEV' confirmed live 2026-03-21).

---

## Phase 9 Implementation Directives

These findings directly constrain Phase 9 implementation choices:

### URL Constants

```javascript
// Day 3–8 fire weather — categorical endpoints
// Source: SPC GIS page https://www.spc.noaa.gov/gis/ + live-verified 2026-03-21
const day3fw_windrhcat = "https://www.spc.noaa.gov/products/exper/fire_wx/day3fw_windrhcat.lyr.geojson";
const day3fw_drytcat   = "https://www.spc.noaa.gov/products/exper/fire_wx/day3fw_drytcat.lyr.geojson";
// ... through day8fw_windrhcat / day8fw_drytcat
```

### Parse Strategy Change (REQUIRED)

`extractPolygons` uses `f.properties.LABEL` as the parse key. For Day 3–8 categorical, `LABEL` is the day identifier (`D3`, `D6`), NOT the risk level. Must use `DN` instead.

**Option 1 — Custom toValue using DN (recommended):**

```javascript
const dnToFireValue = { 0: 0, 5: 1, 8: 2, 10: 3 };
const polys = this.extractPolygons(
  fetchResult.data,
  label => 0,                    // LABEL is not used for value
  (label, val) => false          // never include by label
);
// WRONG — extractPolygons only exposes LABEL, not DN
```

`extractPolygons` is hardcoded to `f.properties.LABEL`. It cannot access `DN` without modification. Phase 9 has two sub-options:

**Option A — Extend extractPolygons to accept a feature-level toValue function (preferred):**

Change `extractPolygons` signature so `toValue` receives `(label, feature)` rather than just `(label)`. Call site: `toValue(label, f)`. This is a one-line change to `extractPolygons` (line 83: `const value = toValue(label, f)`) and all existing callers are unaffected (they ignore the second argument).

Then Day 3–8 caller:
```javascript
const dnToFireValue = { 5: 1, 8: 2, 10: 3 };
const polys = this.extractPolygons(
  fetchResult.data,
  (label, f) => dnToFireValue[f.properties.DN] || 0,
  (label, val) => val > 0
);
```

**Option B — Inline polygon extraction for Day 3–8 (avoids touching extractPolygons):**

Write a short inline loop for Day 3–8 fire weather that reads `DN` directly, without using `extractPolygons`. Slightly more code duplication but zero risk of regressing Day 1–2 logic.

**Recommendation:** Option A. The extractPolygons change is backward-compatible and makes the helper more general. One-line change, all existing callers unaffected.

### "Predictability Too Low" Feature Handling

When a day has `"Predictability Too Low"`, the feature has:
- `DN=0` → `dnToFireValue[0]` → 0 → `val > 0` is false → `includesFeat` returns false → feature skipped

AND as a safety belt:
- `geometry.type = "GeometryCollection"` → not `Polygon` or `MultiPolygon` → `extractPolygons` line 89 (`else return`) fires

Both guards independently ensure no polygon match for "Predictability Too Low" features. No special handling needed.

---

## What This Phase Does NOT Resolve

- **Probable endpoint issuance timing:** The product page and PDD state issuance at 2200 UTC. Not verified via live timing observation — rely on prior research.
- **Empty FeatureCollection (zero features):** Today's files all had exactly 1 feature. Files with 0 features (all-clear day) were not observed live, but `extractPolygons` handles gracefully (forEach over empty array → returns empty array → evaluatePolygons returns `comparator.initial` = 0).
- **DN=5 and DN=10 live observation:** Only DN=8 (Critical) observed in today's live data. DN mapping for Elevated (5) and Extremely Critical (10) inferred from Day 1–2 confirmed schema. Confidence HIGH based on pattern match.

---

## Validation Architecture

> `nyquist_validation: true` — section required.

No automated test framework exists in this project (out of scope per REQUIREMENTS.md). FWXT-05 is a verification phase — the deliverable is this document.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None — no test infrastructure |
| Config file | none |
| Quick run command | Manual — open URLs in browser or curl |
| Full suite command | Manual verification checklist below |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FWXT-05 | All 12 categorical URLs return HTTP 200 | manual-only | `curl -I https://www.spc.noaa.gov/products/exper/fire_wx/day3fw_windrhcat.lyr.geojson` | n/a — no test file |
| FWXT-05 | GeoJSON LABEL2 values confirm categorical (not probabilistic) | manual-only | inspect live JSON | n/a |
| FWXT-05 | DN mapping matches Day 1–2 values | manual-only | inspect live JSON | n/a |

*Justification for manual-only: This phase is about external endpoint verification, not code behavior. All checks require network access to SPC servers. No test file is needed — the verification artifact (this document) IS the deliverable.*

### Sampling Rate

Per REQUIREMENTS.md: no test automation framework planned for v1.1.

### Wave 0 Gaps

None — no test infrastructure needed for this phase. Phase 9 implementation will need validation steps added to its plan.

---

## Sources

### Primary (HIGH confidence)

- Live HTTP checks performed 2026-03-21: all 12 categorical URLs returned HTTP 200 (curl -s -o /dev/null -w "%{http_code}")
- Live GeoJSON inspection 2026-03-21: `day3fw_windrhcat.lyr.geojson`, `day3fw_drytcat.lyr.geojson`, `day4fw_windrhcat.lyr.geojson`, `day6fw_windrhcat.lyr.geojson`
- [SPC GIS page](https://www.spc.noaa.gov/gis/) — canonical URL pattern documented explicitly: `day[3,4,5,6,7,8]fw_[drycat,dryprob,windrhcat,windrhprob].[lyr,nolyr].geojson`
- `node_helper.js` lines 79–93 — `extractPolygons` implementation, LABEL as parse key (confirmed 2026-03-21)
- `node_helper.js` lines 510–562 — `fireRiskToValue = { ELEV: 1, CRIT: 2, EXTM: 3 }`, Day 1–2 fire weather parse (confirmed 2026-03-21)

### Secondary (MEDIUM confidence)

- [SPC Day 3-8 Fire Weather product page](https://www.spc.noaa.gov/products/exper/fire_wx/) — experimental path confirmed; distinct from `/products/fire_wx/`
- DN=5/8/10 for Elevated/Critical/Extremely Critical — confirmed for Day 1–2 via live inspection; inferred consistent for Day 3–8 (pattern match, DN=8 confirmed live for Day 3–8)

---

## Metadata

**Confidence breakdown:**
- URL pattern: HIGH — sourced from official SPC GIS page + all 12 live-verified HTTP 200
- Schema structure: HIGH — live GeoJSON inspected
- LABEL issue: HIGH — observed directly in live data
- DN mapping (DN=5, DN=10): MEDIUM — Day 1–2 confirmed, Day 3–8 pattern inferred; only DN=8 observed live in Day 3–8 data

**Research date:** 2026-03-21
**Valid until:** 2026-04-21 (stable endpoint; SPC rarely changes GIS URL structure)
