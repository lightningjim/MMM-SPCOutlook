# Architecture: Day 3–8 Fire Weather Integration

**Project:** MMM-SPCOutlook v1.1
**Researched:** 2026-03-21
**Scope:** How Day 3–8 fire weather (DryT + WindRH) integrates with the existing node_helper/getDom architecture

---

## Current Architecture (Relevant Subset)

### Data Flow

```
GET_SPC_DATA (socket, extended: bool)
  └── getSpcOutlook(lat, lon, extended)
        ├── Day 1–3 convective: always fetched
        ├── fireWeather Day 1–2: always fetched (before extended branch)
        ├── [if !extended] → return with fireWeather: { day1Risk, day1Text, day2Risk, day2Text }
        └── [if extended] → fetch Day 4–8 convective, then return same fireWeather shape
  └── SPC_DATA_RESULT → this.spcrisk = payload[0]
        └── getDom() renders fireWeather rows when day1Risk > 0 or day2Risk > 0
```

**Critical observation:** The `!extended` early return at line 568 currently exits before Day 4–8 convective, but fireWeather is already populated before that branch. Extended fire weather must be fetched BEFORE that branch point, or the branch must be restructured to include extended fire weather in both return paths.

### Existing fireWeather Return Shape

```js
fireWeather: {
  day1Risk: 0–3,   // integer: 0=none, 1=Elevated, 2=Critical, 3=Extremely Critical
  day1Text: string,
  day2Risk: 0–3,
  day2Text: string
}
```

### Fetch Pattern (Day 1/2 fire weather, lines 514–566)

Each day: two sequential `fetchGeoJsonCached` blocks (WindRH + DryT), `Math.max` combining into a single integer risk. No `fetchAndEvaluateHazard` wrapper — uses raw block pattern. Labels map via `fireRiskToValue = { ELEV: 1, CRIT: 2, EXTM: 3 }`.

---

## Recommended Integration Architecture

### Return Object Extension

Extend `fireWeather` with flat per-day fields, matching the existing Day 1/2 naming convention:

```js
fireWeather: {
  day1Risk: 0–3,  day1Text: string,  // existing
  day2Risk: 0–3,  day2Text: string,  // existing
  // NEW — only present when extended: true
  day3Risk: 0–3,  day3Text: string,
  day4Risk: 0–3,  day4Text: string,
  day5Risk: 0–3,  day5Text: string,
  day6Risk: 0–3,  day6Text: string,
  day7Risk: 0–3,  day7Text: string,
  day8Risk: 0–3,  day8Text: string,
}
```

**Why flat fields over a nested array:** Consistent with the existing Day 1/2 shape. getDom() already accesses `fireWeather.day1Risk` by name. An array would require a different access pattern and a migration of the existing Day 1/2 render code.

**Do NOT add a `fireDay38Risk` boolean sentinel** analogous to `day48Risk`. The existing display pattern (`if dayNRisk > 0`) already gates per-row display — no boolean needed.

### Gating: Identical to day48Risk Extended Gate

YES — gate Day 3–8 fire weather fetch identically to the Day 4–8 convective block. The extended fire weather fetch block belongs inside the `extended` branch, after the current early return.

Current structure:
```
[fire Day 1/2 blocks]
if (!extended) { return ...; }
[convective Day 4–8 blocks]
return { ..., day48Risk, ..., fireWeather: { day1Risk, day2Risk } };
```

Target structure:
```
[fire Day 1/2 blocks]
if (!extended) { return ...; }
[convective Day 4–8 blocks]
[fire Day 3–8 blocks]      ← INSERT HERE
return { ..., day48Risk, ..., fireWeather: { day1Risk, day2Risk, day3Risk...day8Risk } };
```

The `!extended` early return already handles the non-extended case (no Day 3–8 fire weather). Both return paths naturally get only the fields they populate.

### Endpoint URLs

**Day 1/2 (confirmed, existing):**
```
https://www.spc.noaa.gov/products/fire_wx/day1fw_windrh.lyr.geojson
https://www.spc.noaa.gov/products/fire_wx/day1fw_dryt.lyr.geojson
https://www.spc.noaa.gov/products/fire_wx/day2fw_windrh.lyr.geojson
https://www.spc.noaa.gov/products/fire_wx/day2fw_dryt.lyr.geojson
```

**Day 3–8 (inferred pattern — LOW confidence, must verify before implementation):**
```
https://www.spc.noaa.gov/products/exper/fire_wx/day3fw_windrh.lyr.geojson
https://www.spc.noaa.gov/products/exper/fire_wx/day3fw_dryt.lyr.geojson
... (day4fw through day8fw same pattern)
```

The `exper/fire_wx/` path is the known SPC location for Day 3–8 fire weather. The `dayNfw_*.lyr.geojson` filename convention mirrors Day 1/2 exactly, making the inferred pattern high-probability. However, SPC may use a different naming scheme (e.g., `day3-8fw_*`) or may not publish separate per-day GeoJSON files for extended fire weather.

**Action required at implementation start:** Verify URLs are accessible (HTTP 200) before writing fetch code. If the per-day GeoJSON files do not exist, the alternative is the NOAA MapServer REST API at `mapservices.weather.noaa.gov/vector/rest/services/fire_weather/SPC_firewx/MapServer`.

### getDom() Display Logic

Add a loop for Days 3–8 inside the existing `if (this.spcrisk.fireWeather)` block, after the Day 2 check. Each row renders only when `dayNRisk > 0`:

```js
if (this.config.extended && this.spcrisk.fireWeather) {
  for (let d = 3; d <= 8; d++) {
    const risk = this.spcrisk.fireWeather[`day${d}Risk`];
    if (risk > 0) {
      wrapper.innerHTML += `Fire Wx (Day ${d}): <span style="color:#${fireRiskToColor[risk]}">` +
        this.spcrisk.fireWeather[`day${d}Text`] + `</span><br/>`;
    }
  }
}
```

**Why a loop:** Days 3–8 fire weather rows are structurally identical (no CIG, no sub-hazard breakdown). A `for` loop avoids 6 copy-paste blocks while remaining readable. Day 1/2 are not converted to loop — no need to disturb existing working code.

**"No Severe Weather Risk" guard:** The existing condition at line 52–58 checks `fireWeather.day1Risk > 0 || fireWeather.day2Risk > 0`. It does not need to check Days 3–8 because: (a) if the module is not in extended mode those days won't be present; (b) if extended and any extended fire day has risk > 0, the convective extended block (`this.spcrisk.day48Risk`) would also have been fetched — but fire weather and convective are independent. Add an OR clause:

```js
!(this.spcrisk.fireWeather && (
  this.spcrisk.fireWeather.day1Risk > 0 ||
  this.spcrisk.fireWeather.day2Risk > 0 ||
  (this.config.extended && [3,4,5,6,7,8].some(d => this.spcrisk.fireWeather[`day${d}Risk`] > 0))
))
```

---

## Component Boundaries

| Component | Change Type | What Changes |
|-----------|-------------|--------------|
| `node_helper.js` — URL constants | NEW | Add `day3fw`–`day8fw` URL strings (12 URLs, WindRH + DryT per day) |
| `node_helper.js` — fetch blocks | NEW | 6 days × 2 URLs = 12 `fetchGeoJsonCached` blocks inside extended branch |
| `node_helper.js` — extended return | MODIFIED | Add `day3Risk`–`day8Risk` / `day3Text`–`day8Text` to `fireWeather` object |
| `MMM-SPCOutlook.js` — getDom | MODIFIED | Add loop for Days 3–8 fire weather rows inside `extended` guard |
| `MMM-SPCOutlook.js` — "no risk" guard | MODIFIED | OR-extend the fireWeather condition to cover Days 3–8 |

No new dependencies. No schema changes to the socket protocol (payload[0] shape extends backward-compatibly).

---

## Suggested Build Order

1. **Verify endpoints** — Confirm Day 3–8 fire weather GeoJSON URLs return HTTP 200 with valid GeoJSON. This is the only genuine unknown. Everything else is deterministic from the existing pattern.

2. **node_helper.js — URL constants + fetch blocks** — Add URL constants and the 12 fetch blocks inside the extended branch (after existing Day 4–8 convective blocks). Populate `day3FireRisk`–`day8FireRisk` using the same `Math.max(WindRH, DryT)` pattern as Day 1/2.

3. **node_helper.js — return object** — Add `day3Risk`–`day8Risk` and `day3Text`–`day8Text` to the `fireWeather` key in the extended return path only.

4. **MMM-SPCOutlook.js — getDom loop** — Add the `for (let d = 3; d <= 8; d++)` block for fire weather rows.

5. **MMM-SPCOutlook.js — "no risk" guard** — Update the condition to OR-include extended fire weather days.

**Rationale for this order:** Backend changes first means the frontend is never consuming fields that don't exist. Steps 2 and 3 are a single logical unit (fetch + return), done together. Steps 4 and 5 are frontend-only and can be done in either order, but 4 before 5 keeps the guard consistent with what's actually rendered.

---

## Pitfalls

### Endpoint URL Not Confirmed
The Day 3–8 `exper/fire_wx/dayNfw_*.lyr.geojson` URLs are inferred, not verified. If the URLs are wrong, all 12 fetch calls will fail silently (existing error handling returns null → risk stays 0 — correct but misleading). **Verify first.**

### Early Return Position
The Day 3–8 fire weather fetch MUST go inside the extended branch (after the `if (!extended) { return }` line). Placing it before that line would fetch 12 additional URLs on every non-extended update cycle — a meaningful RPi CPU/network hit for a feature that isn't displayed.

### Cache Key Collisions
URL strings are the cache key. Day 3–8 fire weather URLs are distinct strings from all existing keys — no collision risk.

### "No Risk" Guard Omission
If the getDom guard is not updated, a user with only Day 5 fire weather risk (but no convective risk anywhere) will see "No Severe Weather Risk" instead of the fire weather row. Low-probability edge case but a correctness bug.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Return object shape | HIGH | Direct read of existing code |
| getDom display pattern | HIGH | Direct read of existing code |
| Gating strategy | HIGH | Matches existing extended pattern exactly |
| Day 3–8 endpoint URLs | LOW | Pattern inferred; not network-verified |
| Build order | HIGH | Follows existing fetch-then-render dependency |

---

## Sources

- Source code: `node_helper.js` lines 504–800 (fire weather fetch blocks, extended return)
- Source code: `MMM-SPCOutlook.js` lines 46–113 (fireRiskToColor, getDom fire weather render)
- [SPC Fire Weather Experimental Outlook page](https://www.spc.noaa.gov/products/exper/fire_wx/)
- [NOAA MapServer fire_weather/SPC_firewx](https://mapservices.weather.noaa.gov/vector/rest/services/fire_weather/SPC_firewx/MapServer) — fallback if per-day GeoJSON files don't exist
