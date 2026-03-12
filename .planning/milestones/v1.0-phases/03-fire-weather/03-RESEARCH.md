# Phase 3: Fire Weather - Research

**Researched:** 2026-03-05
**Domain:** SPC Fire Weather Outlook GeoJSON endpoints, point-in-polygon detection, MagicMirror display integration
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FIRE-01 | Module fetches SPC Fire Weather Outlook GeoJSON from NOAA endpoints | Endpoints confirmed live; two products per day (WindRH, DryT); `fetchGeoJson()` reusable as-is |
| FIRE-02 | Point-in-polygon detection determines if user location is within a Fire Weather risk zone | `extractPolygons()` + `evaluatePolygons()` pattern already handles LABEL-keyed GeoJSON; no new infrastructure needed |
| FIRE-03 | Fire Weather risk level is displayed on the module alongside convective outlook data | Result added to `getSpcOutlook()` return object; `getDom()` renders it analogously to convective risk rows |
</phase_requirements>

---

## Summary

Phase 3 adds SPC Fire Weather Outlook data to a module that already knows how to fetch GeoJSON, run turf point-in-polygon, and display risk levels. The fire weather feature is entirely new work — no partial implementation exists in `node_helper.js` or `MMM-SPCOutlook.js`. STATE.md noted a concern that "fire weather appears to already have partial implementation per PROJECT.md"; on audit the PROJECT.md listed it as an existing capability but the actual code has no fire weather fetch, no fire weather polygon evaluation, and no fire weather display path. The PROJECT.md description was aspirational/incorrect. This phase builds it from scratch.

The SPC publishes four active GeoJSON files for Days 1 and 2 (the only days with fire weather categorical outlooks): `day1fw_windrh.lyr.geojson`, `day1fw_dryt.lyr.geojson`, `day2fw_windrh.lyr.geojson`, `day2fw_dryt.lyr.geojson`. Each file uses a `LABEL` property with the same three-tier system: `ELEV` (Elevated), `CRIT` (Critical), and `EXTM` (Extremely Critical — rare, high-end events). When no area is designated, GeoJSON features have geometry `null` or an empty GeometryCollection with `LABEL: "No Areas"`.

The recommended scope for this phase is Day 1 and Day 2 fire weather only — Days 3–8 use a separate experimental endpoint (`/products/exper/fire_wx/`) with a different URL pattern and probabilistic (not categorical) output; that complexity is out of scope per REQUIREMENTS.md which does not reference extended fire weather. The approach is: fetch both WindRH and DryT GeoJSON per day, run the existing `extractPolygons()`/`evaluatePolygons()` helpers with a fire-weather-specific label-to-value map, add `fireWeather` fields to the `getSpcOutlook()` return object, and render them in `getDom()` guarded by a fire weather risk present check.

**Primary recommendation:** Fetch Day 1 and Day 2 fire weather (WindRH + DryT), merge into a single per-day highest-risk result using the existing comparator pattern, add `fireWeather.day1` and `fireWeather.day2` to the return object, display as a labeled row in `getDom()` when risk is non-null.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @turf/turf | 7.2.0 (already installed) | Point-in-polygon for fire weather polygons | Already used for all convective polygon math; no new dependency |
| node-fetch | already installed | Fetch fire weather GeoJSON from SPC | Already used for all GeoJSON fetches |

### No New Dependencies Required
Fire weather GeoJSON from SPC is served identically to convective outlook GeoJSON. The existing `fetchGeoJson()` and `extractPolygons()`/`evaluatePolygons()` helpers handle it without modification. No new npm packages are needed for this phase.

**Installation:**
```bash
# No new packages. Existing stack handles everything.
```

---

## Architecture Patterns

### SPC Fire Weather Endpoint Structure

```
Day 1:
  https://www.spc.noaa.gov/products/fire_wx/day1fw_windrh.lyr.geojson
  https://www.spc.noaa.gov/products/fire_wx/day1fw_dryt.lyr.geojson

Day 2:
  https://www.spc.noaa.gov/products/fire_wx/day2fw_windrh.lyr.geojson
  https://www.spc.noaa.gov/products/fire_wx/day2fw_dryt.lyr.geojson
```

Use `.lyr.geojson` (not `.nolyr.geojson`). The layered variant matches the pattern used for convective outlooks (`day1otlk_cat.lyr.geojson`) and is confirmed to include all risk polygon features.

### GeoJSON Feature Structure (confirmed live, 2026-03-05)

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "MultiPolygon", "coordinates": [...] },
      "properties": {
        "DN": 5,
        "VALID": "202603051200",
        "EXPIRE": "202603061200",
        "ISSUE": "202603050639",
        "VALID_ISO": "2026-03-05T12:00:00+00:00",
        "EXPIRE_ISO": "2026-03-06T12:00:00+00:00",
        "ISSUE_ISO": "2026-03-05T06:39:00+00:00",
        "FORECASTER": "Chalmers/Lyons",
        "LABEL": "ELEV",
        "LABEL2": "Elevated Fire Risk",
        "stroke": "#FF7F00",
        "fill": "#FFBF80"
      }
    }
  ]
}
```

### Fire Weather Risk Categories

| LABEL | DN | Full Name | Meaning |
|-------|----|-----------|---------|
| `ELEV` | 5 | Elevated | Wind/RH or dry T-storm elevated risk |
| `CRIT` | 8 | Critical | Wind/RH or dry T-storm critical risk |
| `EXTM` | 10 | Extremely Critical | Highest tier; rare high-end events |
| `No Areas` | 0 | No Areas | No risk zones; feature has null/empty geometry |

DN values provide the numeric ordering: ELEV < CRIT < EXTM. Use DN or a label-to-value map for the comparator — both work. Recommending a label-to-value map for consistency with the existing pattern:

```javascript
const fireRiskToValue = { ELEV: 1, CRIT: 2, EXTM: 3 };
const fireValueToLabel = { 1: "ELEV", 2: "CRIT", 3: "EXTM" };
const fireValueToFull  = { 0: "None", 1: "Elevated", 2: "Critical", 3: "Extremely Critical" };
```

### Pattern: Fire Weather Fetch in `getSpcOutlook()`

Fetch and evaluate four GeoJSON files (two for Day 1, two for Day 2). Use the same `extractPolygons()`/`evaluatePolygons()` calls already used for convective data. Take the max across WindRH and DryT for each day.

```javascript
// Source: pattern verified against existing node_helper.js code + live SPC endpoint
const fireComparator = { initial: 0, comparator: (best, val) => Math.max(best, val) };
const fireRiskToValue = { ELEV: 1, CRIT: 2, EXTM: 3 };

const day1WindRHgj = await this.fetchGeoJson("https://www.spc.noaa.gov/products/fire_wx/day1fw_windrh.lyr.geojson");
const day1DryTgj   = await this.fetchGeoJson("https://www.spc.noaa.gov/products/fire_wx/day1fw_dryt.lyr.geojson");

let day1FireRisk = 0;
if (day1WindRHgj) {
  const polys = this.extractPolygons(day1WindRHgj, label => fireRiskToValue[label] || 0, (label, val) => val > 0);
  day1FireRisk = Math.max(day1FireRisk, this.evaluatePolygons(polys, loc, fireComparator));
}
if (day1DryTgj) {
  const polys = this.extractPolygons(day1DryTgj, label => fireRiskToValue[label] || 0, (label, val) => val > 0);
  day1FireRisk = Math.max(day1FireRisk, this.evaluatePolygons(polys, loc, fireComparator));
}
// day1FireRisk is now 0 (none), 1 (ELEV), 2 (CRIT), or 3 (EXTM)
```

### Pattern: Return Object Addition

Add a `fireWeather` key to the return objects (both the `!extended` and the extended `return` blocks):

```javascript
// Source: existing return object pattern in node_helper.js
fireWeather: {
  day1Risk: day1FireRisk,   // integer 0–3
  day1Text: fireValueToFull[day1FireRisk],
  day2Risk: day2FireRisk,
  day2Text: fireValueToFull[day2FireRisk]
}
```

### Pattern: Display in `getDom()`

Add a fire weather section to `getDom()` before or after the convective risk rows. Guard with `fireWeather.day1Risk > 0 || fireWeather.day2Risk > 0`:

```javascript
// Source: existing getDom() pattern in MMM-SPCOutlook.js
if (this.spcrisk.fireWeather && this.spcrisk.fireWeather.day1Risk > 0) {
  wrapper.innerHTML += "Fire Wx (Day 1): <span style=\"color:#FF7F00\">" + this.spcrisk.fireWeather.day1Text + "</span><br/>";
}
if (this.spcrisk.fireWeather && this.spcrisk.fireWeather.day2Risk > 0) {
  wrapper.innerHTML += "Fire Wx (Day 2): <span style=\"color:#FF7F00\">" + this.spcrisk.fireWeather.day2Text + "</span><br/>";
}
```

Color guidance (from live GeoJSON `stroke` fields): ELEV = `#FF7F00` (orange), CRIT = `#FF0000` (red). EXTM is rarer but follows the same pattern.

### Recommended Color Map

| Risk | Color | Source |
|------|-------|--------|
| ELEV | `#FF7F00` | Live GeoJSON `stroke` field |
| CRIT | `#FF0000` | Live GeoJSON `stroke` field |
| EXTM | `#FF00FF` | Inferred (not yet seen live — MEDIUM confidence); use SPC fire page convention |

### "No Active Risk" Guard

The `getDom()` currently guards with `day1.risk == "NONE" && day2.risk == "NONE" && day3.risk == "NONE"`. This guard must be updated if fire weather risk alone (with no convective risk) should cause the module to show data instead of "No Severe Weather Risk":

```javascript
// Current guard (must be extended for fire weather)
} else if (
  this.spcrisk.day1.risk == "NONE" &&
  this.spcrisk.day2.risk == "NONE" &&
  this.spcrisk.day3.risk == "NONE" &&
  !( this.config.extended && this.spcrisk.day48Risk ) &&
  !(this.spcrisk.fireWeather && (this.spcrisk.fireWeather.day1Risk > 0 || this.spcrisk.fireWeather.day2Risk > 0))
) {
  wrapper.innerHTML = "No Severe Weather Risk"
```

This is a critical correctness concern (FIRE-03 requires fire weather to be visible when active).

### Anti-Patterns to Avoid

- **Fetching fire weather before convective data completes:** All fetches in `getSpcOutlook()` are sequential awaits. Fire weather fetches can be added in sequence after Day 3 data, before the `return` statements. Do not restructure to parallel fetches — this is Phase 4's optimization concern.
- **Filtering on `LABEL2` instead of `LABEL`:** `LABEL2` contains human-readable text ("Elevated Fire Risk"), not the short code. `extractPolygons()` reads `f.properties.LABEL` — use LABEL, not LABEL2.
- **Skipping null geometry check:** When no fire weather areas are designated, the GeoJSON contains a feature with geometry `null` or an empty GeometryCollection and `LABEL: "No Areas"`. The existing `extractPolygons()` only processes features whose geometry type is `"Polygon"` or `"MultiPolygon"` — it correctly ignores null/empty geometries. No special handling needed.
- **Adding fire weather to only one return path:** `getSpcOutlook()` has two `return` statements — one for non-extended and one for extended mode. Both must include `fireWeather`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| GeoJSON fetching | Custom fetch with retry | `fetchGeoJson()` (existing) | Already handles HTTP errors, null returns |
| Polygon extraction | Custom feature iteration | `extractPolygons()` (existing) | Handles Polygon/MultiPolygon, label-to-value mapping, filtering |
| Point-in-polygon | Custom math | `evaluatePolygons()` + turf (existing) | Edge cases around coordinate winding, antimeridian, etc. |
| Risk ordering | Custom sort | Numeric label-to-value map + `Math.max` | Same comparator pattern used for convective data |

**Key insight:** Every infrastructure need for fire weather already exists. The entire implementation is wiring new URL constants and a new label map into the existing fetch-extract-evaluate pattern, then threading the result through the return object and `getDom()`.

---

## Common Pitfalls

### Pitfall 1: Missing the "No Severe Weather Risk" Guard Update
**What goes wrong:** Fire weather is active, but `getDom()` still shows "No Severe Weather Risk" because the convective check passes.
**Why it happens:** The no-risk guard in `getDom()` only checks convective day1/2/3 risk and `day48Risk`. Fire weather is a separate field not included in the original guard.
**How to avoid:** Extend the no-risk guard to also check `fireWeather.day1Risk > 0 || fireWeather.day2Risk > 0`.
**Warning signs:** Simulating fire weather data (non-zero risk) and still seeing "No Severe Weather Risk" in the display.

### Pitfall 2: Forgetting the Second Return Statement
**What goes wrong:** Fire weather displays correctly in non-extended mode but is missing in extended mode (or vice versa).
**Why it happens:** `getSpcOutlook()` has two `return` statements (one for `!extended`, one for extended). Adding `fireWeather` to only one of them causes inconsistent behavior.
**How to avoid:** Search for both `return {` blocks in `getSpcOutlook()` and add `fireWeather` to each.
**Warning signs:** Fire weather absent when extended mode is toggled.

### Pitfall 3: "No Areas" Feature Causing extractPolygons Error
**What goes wrong:** When no fire weather is active, the GeoJSON contains a feature with `geometry: null` or an empty GeometryCollection. If code tries to call `turf.polygon(null)` this throws.
**Why it happens:** Assuming all features in a FeatureCollection have valid Polygon/MultiPolygon geometry.
**How to avoid:** The existing `extractPolygons()` already handles this — it checks `f.geometry.type === "Polygon"` or `"MultiPolygon"` and skips all others. Do not bypass `extractPolygons()` with custom feature iteration.
**Warning signs:** Errors thrown during quiet fire weather days.

### Pitfall 4: EXTM Color Unknown
**What goes wrong:** Extremely Critical events display with wrong or missing color.
**Why it happens:** EXTM events are rare; live GeoJSON confirmed ELEV and CRIT colors but EXTM was not observed today.
**How to avoid:** Use a hardcoded color map based on SPC conventions (`#FF00FF` is commonly used for extreme on SPC maps; verify against a historical event shapefile if possible). The display degrades gracefully if the color is imperfect.
**Warning signs:** Extremely Critical event shows no color (empty string style attribute).

### Pitfall 5: DryT vs WindRH Terminology Confusion
**What goes wrong:** Treating DryT and WindRH as separate risk types displayed independently rather than merging them into one per-day fire risk value.
**Why it happens:** Convective outlooks have separate Tornado/Hail/Wind lines. Assuming fire weather follows the same pattern.
**How to avoid:** Fire weather uses WindRH and DryT as two components of the same day's fire risk assessment. The user only needs to know if they are in any fire risk zone — take the maximum across both components. Display a single "Fire Wx" line per day, not two lines.

---

## Code Examples

### Adding Fire Weather Constants (at top of `getSpcOutlook()`)

```javascript
// Source: verified against live SPC endpoints https://www.spc.noaa.gov/gis/
const day1FwWindRHURL = "https://www.spc.noaa.gov/products/fire_wx/day1fw_windrh.lyr.geojson";
const day1FwDryTURL   = "https://www.spc.noaa.gov/products/fire_wx/day1fw_dryt.lyr.geojson";
const day2FwWindRHURL = "https://www.spc.noaa.gov/products/fire_wx/day2fw_windrh.lyr.geojson";
const day2FwDryTURL   = "https://www.spc.noaa.gov/products/fire_wx/day2fw_dryt.lyr.geojson";

const fireRiskToValue  = { ELEV: 1, CRIT: 2, EXTM: 3 };
const fireValueToFull  = { 0: "None", 1: "Elevated", 2: "Critical", 3: "Extremely Critical" };
const fireRiskToColor  = { 0: "aaaaaa", 1: "FF7F00", 2: "FF0000", 3: "FF00FF" };
const fireComparator   = { initial: 0, comparator: (best, val) => Math.max(best, val) };
```

### Evaluating One Day of Fire Weather (reusable block)

```javascript
// Source: pattern from existing getSpcOutlook() CIG fetch blocks
async function evaluateFireDay(windrhURL, drytURL, loc, fireRiskToValue, fireComparator) {
  // Note: implemented inline in getSpcOutlook(), not as a separate method
  let dayFireRisk = 0;
  const windrhGj = await this.fetchGeoJson(windrhURL);
  if (windrhGj) {
    const polys = this.extractPolygons(windrhGj, label => fireRiskToValue[label] || 0, (label, val) => val > 0);
    dayFireRisk = Math.max(dayFireRisk, this.evaluatePolygons(polys, loc, fireComparator));
  }
  const drytGj = await this.fetchGeoJson(drytURL);
  if (drytGj) {
    const polys = this.extractPolygons(drytGj, label => fireRiskToValue[label] || 0, (label, val) => val > 0);
    dayFireRisk = Math.max(dayFireRisk, this.evaluatePolygons(polys, loc, fireComparator));
  }
  return dayFireRisk;
}
```

### getDom() Display Block

```javascript
// Source: existing getDom() pattern in MMM-SPCOutlook.js
if (this.spcrisk.fireWeather) {
  if (this.spcrisk.fireWeather.day1Risk > 0) {
    wrapper.innerHTML += "Fire Wx (Day 1): <span style=\"color:#" +
      fireRiskToColor[this.spcrisk.fireWeather.day1Risk] + "\">" +
      this.spcrisk.fireWeather.day1Text + "</span><br/>";
  }
  if (this.spcrisk.fireWeather.day2Risk > 0) {
    wrapper.innerHTML += "Fire Wx (Day 2): <span style=\"color:#" +
      fireRiskToColor[this.spcrisk.fireWeather.day2Risk] + "\">" +
      this.spcrisk.fireWeather.day2Text + "</span><br/>";
  }
}
```

Note: `fireRiskToColor` must be accessible in `getDom()` — define it as a local constant at the top of `getDom()` analogous to `cigLabel`.

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Boolean SIGN indicator | CIG1/CIG2/CIG3 tiers (Phase 2) | Phase 3 builds on stable Phase 2 code |
| No fire weather support | SPC fire weather GeoJSON endpoints (this phase) | New capability |

**No deprecated APIs in use.** The fire weather GeoJSON endpoints (`/products/fire_wx/dayNfw_*.lyr.geojson`) are the current SPC product delivery mechanism as of March 2026.

---

## Open Questions

1. **EXTM color code**
   - What we know: Live GeoJSON confirms ELEV=`#FF7F00`, CRIT=`#FF0000`. EXTM was not active today.
   - What's unclear: The exact hex color SPC assigns to EXTM in the `stroke` property.
   - Recommendation: Use `#FF00FF` (magenta) as a placeholder; it is clearly distinct from ELEV/CRIT and consistent with SPC's convention for highest-severity indicators on other products. If an EXTM event occurs, the live GeoJSON will confirm the correct color.

2. **Scope: should fire weather show on the "no risk" quiet display?**
   - What we know: FIRE-03 says fire weather risk is displayed "alongside convective outlook data."
   - What's unclear: If only fire weather is active (no convective risk), should the module show fire weather or still show "No Severe Weather Risk"?
   - Recommendation: Yes — the "No Severe Weather Risk" guard should be extended to suppress that message when fire weather is active. The user is in a risk zone; showing nothing is a false negative, which violates the core value ("no false negatives").

---

## Validation Architecture

nyquist_validation is enabled. However, per REQUIREMENTS.md, "Automated testing framework — No test infrastructure exists; not added in this pass" is explicitly listed as out of scope. No test files exist in the repository.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None — explicitly excluded from v1 scope per REQUIREMENTS.md |
| Config file | N/A |
| Quick run command | Manual verification (see below) |
| Full suite command | Manual verification (see below) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FIRE-01 | GeoJSON fetched from SPC endpoints on update | manual | `Log.info` trace in MagicMirror console showing fire weather fetch URLs | N/A |
| FIRE-02 | Point-in-polygon correctly fires for location in risk zone | manual | Configure lat/lon to a known fire risk area; verify result in console output | N/A |
| FIRE-03 | Fire weather risk displayed when active | manual | Verify display shows "Fire Wx" line when FIRE-02 confirms location is in zone | N/A |

### Sampling Rate
- **Per task commit:** Manual check — inspect `Log.info` output for fire weather GeoJSON fetch and polygon evaluation result
- **Per wave merge:** Manual end-to-end — configure a lat/lon known to be in an active SPC fire weather zone; confirm display shows fire weather risk
- **Phase gate:** All three FIRE requirements verified manually before `/gsd:verify-work`

### Wave 0 Gaps
None — no test infrastructure exists and none is required per project scope. Manual verification is the defined acceptance mechanism for this project.

---

## Sources

### Primary (HIGH confidence)
- Live SPC endpoint `https://www.spc.noaa.gov/products/fire_wx/day1fw_windrh.lyr.geojson` — LABEL field values (ELEV, CRIT), properties structure, geometry types confirmed on 2026-03-05
- Live SPC endpoint `https://www.spc.noaa.gov/products/fire_wx/day2fw_windrh.lyr.geojson` — Day 2 structure confirmed identical to Day 1
- `https://www.spc.noaa.gov/gis/` — complete list of fire weather GeoJSON endpoint URLs for Days 1-2
- Existing `node_helper.js` codebase — `extractPolygons()`, `evaluatePolygons()`, `fetchGeoJson()` API confirmed by reading source

### Secondary (MEDIUM confidence)
- DN values (ELEV=5, CRIT=8, EXTM=10) from WebSearch cross-referencing MapServer documentation at `https://mapservices.weather.noaa.gov/vector/rest/services/fire_weather/SPC_firewx/MapServer`
- BoulderCAST fire weather explanation — risk tier names and coverage definitions (ELEV/CRIT/EXTM) corroborated against live GeoJSON LABEL2 field values

### Tertiary (LOW confidence)
- EXTM color `#FF00FF` — inferred from SPC convention; not confirmed from live data (no EXTM event active on research date)

---

## Metadata

**Confidence breakdown:**
- SPC endpoint URLs and GeoJSON structure: HIGH — confirmed from live fetches on 2026-03-05
- LABEL values (ELEV, CRIT): HIGH — observed in live GeoJSON `properties.LABEL`
- LABEL value EXTM: MEDIUM — documented in multiple sources, confirmed by DN=10 in MapServer docs, not seen live
- EXTM color: LOW — inferred, not observed in live data
- Architecture (reuse of existing helpers): HIGH — confirmed by reading actual codebase
- No existing fire weather implementation: HIGH — confirmed by complete audit of node_helper.js and MMM-SPCOutlook.js

**Research date:** 2026-03-05
**Valid until:** 2026-04-05 (SPC endpoint URLs are stable; fire weather season makes live testing possible)
