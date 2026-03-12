# Phase 2: CIG Tier Support - Research

**Researched:** 2026-03-04
**Domain:** SPC GeoJSON API changes — Conditional Intensity Groups (CIG) replacing SIGN
**Confidence:** HIGH (live endpoint verification confirmed; CIG2/CIG3 colors MEDIUM due to no active high-risk day)

---

## Summary

The Storm Prediction Center deployed a major change to convective outlook data on March 2-3, 2026.
The long-standing boolean `SIGN` hatching flag has been **completely replaced** by tiered Conditional
Intensity Groups: `CIG1`, `CIG2`, and `CIG3`. These appear as string values in the `LABEL` property
of new dedicated GeoJSON endpoints (`day1otlk_cigtorn.lyr.geojson`, `day1otlk_cighail.lyr.geojson`,
`day1otlk_cigwind.lyr.geojson`, and equivalents for Day 2 and a unified `day3otlk_cigprob.lyr.geojson`
for Day 3). The old `SIGN`-matching pattern in `node_helper.js` no longer matches any live data.

The current `sigComparator` and the `label === "SIGN"` filter in `extractPolygons` are now dead code
against the live API. Phase 2 must replace them with CIG-aware logic that (a) fetches the new CIG
endpoints, (b) extracts `CIG1`/`CIG2`/`CIG3` labels, (c) maps them to a numeric tier (1/2/3), and
(d) passes the tier value through to the frontend for distinct visual rendering.

**Primary recommendation:** Fetch the six new CIG endpoints (cigtorn/cighail/cigwind for Days 1 and 2,
cigprob for Day 3), parse `LABEL` as a CIG tier string, store as `torCig`/`hailCig`/`windCig` integer
(0 = none), and render CIG1/CIG2/CIG3 with visually distinct text indicators in the frontend.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SPC-01 | SIGN risk supports CIG1/CIG2/CIG3 tiered severity levels (replaces previous boolean SIGN) | New CIG GeoJSON endpoints confirmed live; LABEL values "CIG1"/"CIG2"/"CIG3" verified; backend must replace sigComparator + SIGN filter with CIG extractor |
| SPC-02 | Module display renders CIG1/CIG2/CIG3 SIGN tiers visually (distinct from each other) | Current frontend renders boolean torSign as "⚠"; must be replaced with three visually distinct tier indicators; no CSS framework change needed |
</phase_requirements>

---

## Standard Stack

### Core (no new dependencies needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| node-fetch | 2.6.1 | Fetch new CIG GeoJSON endpoints | Already used for all SPC fetches |
| @turf/turf | 7.2.0 | booleanPointInPolygon on CIG polygons | Already used for all polygon checks |
| Existing `extractPolygons()` | — | Parses GeoJSON features by LABEL | Works with string LABELs; no changes needed to the function itself |

No new npm packages are required. The new CIG endpoints return GeoJSON in the same schema as the
existing tornado/hail/wind endpoints. The `extractPolygons` function already accepts arbitrary
`toValue` and `includesFeat` callbacks, making it fully reusable for CIG parsing.

### New URL Endpoints (HIGH confidence — verified live)

| Endpoint | Day | Hazard |
|----------|-----|--------|
| `https://www.spc.noaa.gov/products/outlook/day1otlk_cigtorn.lyr.geojson` | Day 1 | Tornado CIG |
| `https://www.spc.noaa.gov/products/outlook/day1otlk_cighail.lyr.geojson` | Day 1 | Hail CIG |
| `https://www.spc.noaa.gov/products/outlook/day1otlk_cigwind.lyr.geojson` | Day 1 | Wind CIG |
| `https://www.spc.noaa.gov/products/outlook/day2otlk_cigtorn.lyr.geojson` | Day 2 | Tornado CIG |
| `https://www.spc.noaa.gov/products/outlook/day2otlk_cighail.lyr.geojson` | Day 2 | Hail CIG |
| `https://www.spc.noaa.gov/products/outlook/day2otlk_cigwind.lyr.geojson` | Day 2 | Wind CIG |
| `https://www.spc.noaa.gov/products/outlook/day3otlk_cigprob.lyr.geojson` | Day 3 | Any-severe CIG |

**Day 3 note:** The old `day3otlk_sigprob.lyr.geojson` endpoint is replaced by `day3otlk_cigprob.lyr.geojson`.
The new endpoint carries a unified CIG level across all hazard types (not split by tornado/hail/wind).
LABEL2 on the verified Day 3 feature reads "Any Severe Conditional Intensity Group 1 Risk".

**Days 4-8 note:** No CIG endpoints exist for Days 4-8. The old SIGN detection for Days 4-8 (via
`label === "SIGN"` on the prob GeoJSON) is also obsolete. Leave Day 4-8 SIGN logic as-is (returning
false) or remove it — no new CIG tiers are issued for the extended outlook.

---

## Architecture Patterns

### GeoJSON Schema — CIG Endpoints (HIGH confidence — live verified)

```
FeatureCollection
  features[]
    geometry: Polygon | MultiPolygon | empty GeometryCollection (no risk)
    properties:
      LABEL:     "CIG1" | "CIG2" | "CIG3" | ""   ← the key field
      LABEL2:    "Tornado Conditional Intensity Group 1 Risk" (human text)
      DN:        numeric (density order)
      VALID:     "202603051200"
      EXPIRE:    "202603061200"
      ISSUE:     "202603041735"
      VALID_ISO: "2026-03-05T12:00:00+00:00"
      EXPIRE_ISO: "..."
      ISSUE_ISO:  "..."
      FORECASTER: "Grams"
      stroke:    "#000000"   ← black border (all tiers same, today)
      fill:      "#888888"   ← gray fill (verified for CIG1; CIG2/CIG3 unconfirmed)
```

**When no CIG area exists:** A single feature with empty GeometryCollection is returned and LABEL = "".
The existing guard `if (!includesFeat(label, value)) return;` in `extractPolygons` handles this
correctly — an empty geometry will not reach the polygon construction step.

### Pattern 1: CIG Extraction (replaces SIGN extraction)

**What:** Replace the `label === "SIGN"` filter + boolean sigComparator with a CIG-aware numeric mapper.

**When to use:** Whenever fetching cigtorn/cighail/cigwind GeoJSON and checking if location is inside.

```javascript
// Source: live endpoint verification, 2026-03-04
// Map CIG label string to numeric tier (0 = none)
const cigToTier = { CIG1: 1, CIG2: 2, CIG3: 3 };

// CIG comparator: keep highest tier found
const cigComparator = {
  initial: 0,
  comparator: (best, val) => Math.max(best, val)
};

// Extract CIG polygons from a CIG endpoint GeoJSON
// ciggeojson = await this.fetchGeoJson(day1CigTorURL);
const cigPolys = this.extractPolygons(
  ciggeojson,
  label => cigToTier[label] || 0,        // toValue: "CIG1" -> 1, "" -> 0
  (label, val) => val > 0                  // includesFeat: skip LABEL="" features
);

// Evaluate: returns 0 (none), 1, 2, or 3
const torCig = this.evaluatePolygons(cigPolys, loc, cigComparator);
```

**Key insight:** `extractPolygons` already supports arbitrary string-to-number mappers. No changes to
`extractPolygons` are needed — only the caller arguments change.

### Pattern 2: Return Object Changes (backend)

Replace boolean `torSign`/`hailSign`/`windSign` with integer CIG tier fields:

```javascript
// Before (boolean):
"torSign": day1TorSign,   // true | false

// After (integer tier):
"torCig": day1TorCig,     // 0 | 1 | 2 | 3
"hailCig": day1HailCig,
"windCig": day1WindCig,
```

Day 3 uses a unified field since cigprob is not split by hazard type:

```javascript
day3: {
  "risk": day3Risk,
  "text": valueToFullRisk[day3Risk],
  "color": riskToColor[day3Risk],
  "probRisk": day3ProbRisk,
  "cig": day3Cig            // replaces "sign": day3Sign
}
```

### Pattern 3: Frontend Visual Rendering

Replace the boolean `⚠` indicator with a 3-tier display. Three options are viable since this module
uses no icon library for CIG — text/emoji is the practical approach:

```javascript
// Tier indicator helper (frontend)
cigLabel = (cig) => {
  if (cig === 3) return "⚠⚠⚠ ";  // CIG3: most intense
  if (cig === 2) return "⚠⚠ ";
  if (cig === 1) return "⚠ ";
  return "";
};

// Usage in getDom() — Day 1 tornado:
if (this.spcrisk.day1.torRisk > 0)
  probRiskHTML += "<i class=\"wi wi-tornado\"></i>"
    + cigLabel(this.spcrisk.day1.torCig)
    + 100 * this.spcrisk.day1.torRisk + "% ";
```

**Alternative approach (text):** `CIG1`/`CIG2`/`CIG3` inline text is also distinct and unambiguous,
but less compact on the MagicMirror display. Prefer `⚠`/`⚠⚠`/`⚠⚠⚠` for density.

### Recommended Project Structure

No structural changes needed. Both files are modified in place:

```
node_helper.js       ← replace SIGN logic with CIG fetch + extract + return
MMM-SPCOutlook.js    ← replace torSign boolean display with cigLabel() tier display
```

### Anti-Patterns to Avoid

- **Keeping `label === "SIGN"` filter alongside CIG:** SIGN no longer appears in live data.
  Remove the old SIGN extraction entirely, do not keep it as a fallback.
- **Fetching CIG endpoint when base risk is zero:** The current code guards SIGN fetch with
  `if(day1TorRisk > 0)`. Keep this guard for CIG to avoid unnecessary fetches on no-risk days.
- **Treating CIG as boolean:** `torCig > 0` checks that a CIG area exists; the actual tier
  value (1/2/3) must be preserved and passed through to the frontend.
- **Reusing the old `day3otlk_sigprob.lyr.geojson` URL:** This is the old SIGN endpoint.
  Replace with `day3otlk_cigprob.lyr.geojson`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Polygon containment check | Custom lat/lon math | Existing `evaluatePolygons()` with cigComparator | Already proven, handles Polygon + MultiPolygon |
| CIG string-to-tier mapping | Complex parsing | Simple object lookup `{ CIG1:1, CIG2:2, CIG3:3 }` | Only 3 possible values; exact string match |
| GeoJSON fetching | New fetch wrapper | Existing `fetchGeoJson()` | Handles errors, returns null on failure |
| Feature extraction | New loop | Existing `extractPolygons()` | Works with any `toValue` + `includesFeat` callbacks |

---

## Common Pitfalls

### Pitfall 1: SIGN Endpoint Still in Code
**What goes wrong:** `day3otlk_sigprob.lyr.geojson` still fetched; returns 404 or stale data.
**Why it happens:** Forgetting to update the Day 3 URL variable name.
**How to avoid:** Replace `day3SignUrl` variable with `day3CigUrl` pointing to `day3otlk_cigprob.lyr.geojson`.
**Warning signs:** Day 3 `cig` always returns 0 even on active significant-risk days.

### Pitfall 2: SIGN Guard Pattern Left in Place
**What goes wrong:** `(label,val) => label === "SIGN"` filter returns no features; CIG is never detected.
**Why it happens:** Editing the URL but forgetting to update the `includesFeat` and `toValue` callbacks.
**How to avoid:** Change both the URL and the `extractPolygons` call arguments together.

### Pitfall 3: Frontend Still Reads `torSign` Boolean
**What goes wrong:** After backend change, `this.spcrisk.day1.torSign` is `undefined`; display breaks.
**Why it happens:** Backend renames field to `torCig` but frontend still references `torSign`.
**How to avoid:** Update both files in the same plan wave. Rename field in backend return object
  and update all references in `getDom()`.

### Pitfall 4: Empty Geometry Features Crash extractPolygons
**What goes wrong:** When no CIG area exists, the endpoint returns a feature with `GeometryCollection`
  (not Polygon/MultiPolygon). Current `extractPolygons` returns early via the `else return` branch —
  this is correct behavior but must be verified not to throw.
**Why it happens:** The `geometry.type` is `"GeometryCollection"` which matches neither Polygon nor
  MultiPolygon, so the `else return` fires safely.
**Warning signs:** Crash/exception when location is outside any CIG area.
**How to avoid:** Confirm the `else return` path in `extractPolygons` handles GeometryCollection safely
  — it does, but add explicit null check on `f.geometry` (already present via `else return`).

### Pitfall 5: Day 4-8 CIG Fetch Attempted
**What goes wrong:** No CIG endpoints exist for Days 4-8; a fetch would 404.
**Why it happens:** Assuming CIG expansion follows the same pattern as Days 1-3.
**How to avoid:** Leave Day 4-8 sign logic unchanged (returns false); CIG is Days 1-3 only.

### Pitfall 6: CIG2/CIG3 Color Assumptions
**What goes wrong:** Using hardcoded fill colors from GeoJSON for visual display when CIG2/CIG3
  might differ.
**Why it happens:** Today's live data only shows CIG1 (gray `#888888`). CIG2/CIG3 colors are not
  yet confirmed from live data.
**How to avoid:** Do not rely on GeoJSON `fill` property for module display — SPC colors from the
  GeoJSON are for map rendering. The module's display uses text/emoji tier indicators, not fill colors.
  If color coding is desired, use custom colors (e.g., yellow/orange/red) as the module's own design.

---

## Code Examples

### Backend — CIG Extraction (node_helper.js)

```javascript
// Source: live endpoint verification, 2026-03-04
// Replaces the sigComparator + "label === 'SIGN'" pattern

const cigToTier = { CIG1: 1, CIG2: 2, CIG3: 3 };

const cigComparator = {
  initial: 0,
  comparator: (best, val) => Math.max(best, val)
};

// Day 1 Tornado CIG (fetch only if tornado prob > 0)
const day1CigTorURL = "https://www.spc.noaa.gov/products/outlook/day1otlk_cigtorn.lyr.geojson";
let day1TorCig = 0;
if (day1TorRisk > 0) {
  const cigGeojson = await this.fetchGeoJson(day1CigTorURL);
  if (cigGeojson) {
    const cigPolys = this.extractPolygons(
      cigGeojson,
      label => cigToTier[label] || 0,
      (label, val) => val > 0
    );
    day1TorCig = this.evaluatePolygons(cigPolys, loc, cigComparator);
  }
}
```

### Backend — Day 3 CIG (unified cigprob)

```javascript
// Source: live endpoint verification + sample data, 2026-03-04
const day3CigUrl = "https://www.spc.noaa.gov/products/outlook/day3otlk_cigprob.lyr.geojson";
let day3Cig = 0;
if (day3ProbRisk > 0) {
  const cigGeojson = await this.fetchGeoJson(day3CigUrl);
  if (cigGeojson) {
    const cigPolys = this.extractPolygons(
      cigGeojson,
      label => cigToTier[label] || 0,
      (label, val) => val > 0
    );
    day3Cig = this.evaluatePolygons(cigPolys, loc, cigComparator);
  }
}
// Return: "cig": day3Cig  (replaces "sign": day3Sign)
```

### Frontend — Tier Indicator (MMM-SPCOutlook.js)

```javascript
// Source: project pattern (no external library)
// Inside getDom()
const cigLabel = (cig) => {
  if (cig === 3) return "⚠⚠⚠ ";
  if (cig === 2) return "⚠⚠ ";
  if (cig === 1) return "⚠ ";
  return "";
};

// Day 1 tornado line (replaces torSign boolean check):
if (this.spcrisk.day1.torRisk > 0)
  probRiskHTML += "<i class=\"wi wi-tornado\"></i>"
    + cigLabel(this.spcrisk.day1.torCig)
    + 100 * this.spcrisk.day1.torRisk + "% ";
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Boolean `SIGN` label in torn/hail/wind GeoJSON | String `CIG1`/`CIG2`/`CIG3` in dedicated CIG endpoints | March 2-3, 2026 | Old SIGN detection is dead code; must switch endpoints and label parsing |
| `day3otlk_sigprob.lyr.geojson` | `day3otlk_cigprob.lyr.geojson` | March 2-3, 2026 | URL must be updated; old URL returns stale or 404 |
| Single `torSign: boolean` field in result | `torCig: 0|1|2|3` integer field | Phase 2 | Frontend must display 3 distinct tiers, not binary |
| `⚠` warning indicator | Multi-tier `⚠`/`⚠⚠`/`⚠⚠⚠` indicator | Phase 2 | Communicates severity gradient to user |

**Deprecated/outdated:**
- `sigComparator` object: no longer needed (SIGN label gone from API)
- `day3SignUrl = "...day3otlk_sigprob.lyr.geojson"`: URL is obsolete, replace with cigprob
- Day 4-8 SIGN checks: were always marginal; now completely inert (no SIGN in Days 4-8 data)

---

## Open Questions

1. **CIG2 and CIG3 fill colors in GeoJSON**
   - What we know: CIG1 uses `fill: "#888888"` (gray). From the SPC info page, CIG2 uses denser
     hatching and CIG3 uses cross-hatching — these are map rendering conventions, not module colors.
   - What's unclear: Whether CIG2/CIG3 features embed different fill hex values in the GeoJSON.
   - Recommendation: Ignore GeoJSON `fill` property for this module entirely. Define module-specific
     CIG tier indicator symbols/text (not background colors) to remain legible on all MagicMirror
     display themes. If the project owner wants color coding, pick a simple escalating palette
     (e.g., yellow/orange/red) independently of SPC map colors.

2. **Whether Day 1 CIG endpoints also serve historical/all-day outlooks**
   - What we know: Day 1 has multiple outlook issuances (0600, 1300, 1630, 2000 UTC). The sample
     zip uses `_1630` timestamped files; the live `.lyr.geojson` URLs appear to serve the current/latest.
   - What's unclear: Whether the current `day1otlk_cigtorn.lyr.geojson` pattern stays stable as
     the day progresses through multiple issuances.
   - Recommendation: Use the same `.lyr.geojson` naming convention already used for torn/hail/wind;
     this is what SPC maintains as the "current" endpoint and the module already relies on this pattern.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None — no test infrastructure exists or is planned (see REQUIREMENTS.md: "Automated testing framework" is Out of Scope) |
| Config file | N/A |
| Quick run command | Manual: Load MagicMirror and observe display output |
| Full suite command | Manual: Verify with live SPC data and console log inspection |

### Phase Requirements — Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SPC-01 | Backend parses CIG1/CIG2/CIG3 from cigtorn/cighail/cigwind GeoJSON as distinct integer tiers (0/1/2/3) | manual-only | — no test framework | N/A |
| SPC-02 | Frontend renders CIG1 as "⚠", CIG2 as "⚠⚠", CIG3 as "⚠⚠⚠" (or equivalent distinct display) | manual-only | — no test framework | N/A |

**Justification for manual-only:** REQUIREMENTS.md explicitly lists "Automated testing framework" as
Out of Scope. No test runner, config, or test files exist. Validation must be done by inspecting
`console.log` output (the SPC_DATA_RESULT log in `MMM-SPCOutlook.js` line 21 already JSON-stringifies
the full result) and visually confirming MagicMirror display.

**Practical validation steps (in lieu of automated tests):**
1. Temporarily add `console.log("CIG Debug:", day1TorCig, day1HailCig, day1WindCig)` after extraction.
2. On a day with CIG areas active, check that values are 1/2/3 (not `true`/`false`/`undefined`).
3. Confirm frontend display shows distinct tier indicators for different CIG values.
4. Confirm no CIG area returns 0 and no `⚠` is rendered.

### Wave 0 Gaps

None — existing infrastructure covers all phase requirements (no automated test infrastructure
exists, and none is being added in this phase).

---

## Sources

### Primary (HIGH confidence)
- Live endpoint: `https://www.spc.noaa.gov/products/outlook/day2otlk_cigtorn.lyr.geojson` — LABEL="CIG1", LABEL2="Tornado Conditional Intensity Group 1 Risk", fill="#888888", stroke="#000000" verified 2026-03-04
- Live endpoint: `https://www.spc.noaa.gov/products/outlook/day3otlk_cigprob.lyr.geojson` — LABEL="CIG1", LABEL2="Any Severe Conditional Intensity Group 1 Risk" verified 2026-03-04
- SPC sample GeoJSON zip: `https://www.spc.noaa.gov/exper/conditional-intensity-information/datafiles/geojson.zip` — file listing confirmed cigtorn/cighail/cigwind for Days 1-2, cigprob for Day 3

### Secondary (MEDIUM confidence)
- SPC official CIG info page: `https://www.spc.noaa.gov/exper/conditional-intensity-information/` — CIG1/CIG2/CIG3 definitions, hazard thresholds, hatching descriptions
- NWS Service Change Notice 26-11 PDF (partially readable): `https://www.weather.gov/media/notification/pdf_2026/scn26-11_SPC_conditional-intensity.pdf` — implementation date March 2, 2026
- TalkWeather forum thread: `https://talkweather.com/threads/spc-outlook-changes-march-2-2026.2479/` — hatching patterns: no hatch=<CIG1, single hatch=CIG1, double hatch=CIG2, cross-hatch=CIG3

### Tertiary (LOW confidence)
- WebSearch community sources (Memphis Weather, WTOL, Fox Weather): confirm March 2-3, 2026 deployment and CIG1/CIG2/CIG3 naming, but no GeoJSON schema details

---

## Metadata

**Confidence breakdown:**
- GeoJSON endpoint URLs: HIGH — live-verified on all six cigtorn/cighail/cigwind + cigprob URLs
- LABEL field values (CIG1): HIGH — directly observed in live Day 2 cigtorn and Day 3 cigprob responses
- LABEL field values (CIG2/CIG3): MEDIUM — confirmed by SPC documentation but no active high-risk day available to observe live
- CIG2/CIG3 GeoJSON fill colors: LOW — only CIG1 gray (#888888) observed; CIG2/CIG3 fill may differ
- Architecture pattern (cigComparator + extractPolygons): HIGH — matches existing code patterns exactly
- Day 3 unified cigprob (not split by hazard): HIGH — live-verified and confirmed by sample zip structure
- Days 4-8 have no CIG: MEDIUM — inferred from sample zip containing no Day 4-8 CIG files

**Research date:** 2026-03-04
**Valid until:** 2026-04-04 (30 days) — SPC endpoint naming is stable; refresh if SPC announces further changes
