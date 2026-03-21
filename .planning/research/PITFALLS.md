# Domain Pitfalls

**Domain:** Adding Day 3–8 fire weather (DryT/WindRH extended forecasts) to existing MagicMirror² SPC module
**Researched:** 2026-03-21

---

## Critical Pitfalls

### Pitfall 1: Extended Fire Weather Endpoints Are NOT Parallel to Day 1–2

**What goes wrong:** Developer assumes `day3fw_windrh.lyr.geojson` and `day3fw_dryt.lyr.geojson` exist at `https://www.spc.noaa.gov/products/fire_wx/` by analogy with Day 1 and Day 2. They do not. The URL pattern breaks entirely for Day 3+.

**Why it happens:** The Day 1–2 fire weather endpoints follow a clean naming convention (`day1fw_windrh.lyr.geojson`, `day2fw_dryt.lyr.geojson`). It is natural to extrapolate `day3fw_*` through `day8fw_*`. SPC does not publish these files.

**What SPC actually publishes for Day 3–8 fire weather:**
- Human-readable HTML forecasts at `https://www.spc.noaa.gov/products/exper/fire_wx/`
- No `.lyr.geojson` files confirmed for Day 3–8 via search or live inspection as of 2026-03-21
- The extended fire weather product is experimental, issued once daily at 2200 UTC

**Consequences:** 404 errors on every update cycle for 12 non-existent URLs. `fetchGeoJsonCached` returns `{ data: null, cachedResult: null }` for each, and extended fire weather silently shows 0 risk for all days, making the feature appear to work while doing nothing.

**Prevention:** Before writing a single line of fetch code, verify all 12 target URLs return HTTP 200 with valid GeoJSON. Use `curl -I` or the existing `fetchGeoJson` with test logging to confirm endpoint existence. Do not assume naming continuity from Day 1–2.

**Detection:** Log the HTTP status code returned for each extended fire weather URL on first fetch. A 404 or connection failure with `cachedResult: null` on every cycle is the warning sign.

**Phase:** Address in the URL verification task before any implementation work. Block implementation on confirmed live URLs.

**Confidence:** HIGH — v1 Phase 3 research (2026-03-05) explicitly flagged this: "Days 3–8 use a separate experimental endpoint with a different URL pattern and probabilistic (not categorical) output; that complexity is out of scope."

---

### Pitfall 2: Schema Difference — Extended Fire Weather Uses Probabilistic, Not Categorical LABEL

**What goes wrong:** If SPC does publish Day 3–8 fire weather GeoJSON files, the feature schema will likely differ from the Day 1–2 categorical LABEL system (ELEV/CRIT/EXTM). The existing `extractPolygons()` call using `fireRiskToValue[label] || 0` will silently return 0 for all features if the LABEL property contains probability integers or different string values.

**Why it happens:** The Day 3–8 fire weather outlook is documented as probabilistic, not categorical. The convective extended outlook uses numeric probability labels (`5`, `15`, `30`...) in its GeoJSON. Fire weather extended may follow the same pattern — or a completely different schema. The existing label-to-value map `{ ELEV: 1, CRIT: 2, EXTM: 3 }` will not match numeric probability strings.

**Consequences:** All extended fire weather polygon evaluations return 0. Module never shows extended fire weather risk even when the user is inside a risk zone. Silent false negative — the worst failure mode for this module's core value.

**Prevention:** Fetch and inspect at least one live extended fire weather GeoJSON file before coding the label mapper. Check `properties.LABEL` values directly. If numeric probabilities are found, use the same `parseFloat(label)` pattern already used for Days 4–8 convective outlooks.

**Detection:** Manually log the raw `properties.LABEL` values from the first feature of each fetched GeoJSON. If labels don't match `{ ELEV, CRIT, EXTM }`, the mapper is wrong.

**Phase:** Must be verified during the URL/schema investigation task before the fetch implementation task.

**Confidence:** MEDIUM — Probabilistic output for extended fire weather is documented but specific property schema of the GeoJSON (if it exists) has not been confirmed live.

---

## Moderate Pitfalls

### Pitfall 3: 12 Additional Sequential Fetches Extend Update Cycle Time on RPi

**What goes wrong:** Adding 12 new `fetchGeoJsonCached` calls (2 per day × 6 days) to `getSpcOutlook()` in the extended branch adds up to 12 sequential HTTP round-trips. On a Raspberry Pi with a slow connection, or when SPC servers are slow, the update cycle may take 30–60+ seconds on cache miss, blocking the event loop on every cold start or cache invalidation.

**Why it happens:** The existing architecture is sequential awaits. The Day 4–8 convective fetch adds 5 sequential calls in the extended branch. Adding 12 more fire weather calls compounds this. On a quiet fire weather day all 12 return quickly (small "no areas" GeoJSON), but on first load after a reboot — or when the ETag changes for all files simultaneously at SPC's nightly issuance — every call is a cache miss.

**Consequences:** MagicMirror display takes much longer to render the first result after module start or cache flush. RPi CPU remains engaged for the entire sequential chain even though it is mostly waiting on I/O.

**Mitigation:** Cache behavior means after the first cycle most extended fire weather calls will return `304 Not Modified` (or hash-match) and cost only one HTTP round-trip with no turf work. The RPi CPU impact per cycle is low once warm. The initial cold start cost is the actual concern.

**Prevention:** Gate all 12 extended fire weather fetches inside the `if (extended)` branch (they already should be). Consider whether a Day 3 fetch alone covers the highest-value case for most users, deferring Days 4–8 fire weather to a config option (`extendedFireWeather: true`). At minimum, note in the plan that performance on the first cold cycle should be observed post-deployment.

**Phase:** Note in implementation plan. Measure actual cycle time post-implementation. If cold-start time is > 60s total, consider parallelizing the extended fire weather fetches with `Promise.all`.

**Confidence:** HIGH — Based on existing code structure and RPi constraint documented in PROJECT.md.

---

### Pitfall 4: Cache Entry Collision Between Per-Day Fire Weather Risk Value and Per-Day Convective Risk Value

**What goes wrong:** The cache stores a per-URL result value. For Day 1–2 fire weather, the cached `result` is an integer (0–3, the max fire risk from WindRH and DryT merged). This is correct. For Days 3–8, if a single file covers both WindRH and DryT (combined), or if the developer caches the wrong intermediate value (e.g., just WindRH risk before merging with DryT), the cache entry for the URL may hold a value from only one component, not the merged max.

**Why it happens:** The v1 Day 1–2 fire weather implementation caches result values per URL — each URL (WindRH, DryT separately) stores its individual risk value. The per-day merged max is computed in memory but never stored. This is correct because the two URLs are separate. If Day 3–8 uses a combined URL (one file for both components), caching must still store the correct final value.

**Consequences:** On a cache hit, the retrieved `cachedResult` for a URL reflects only that URL's contribution to the max, not the combined per-day result. If Day 3 has a single URL that covers both components, the cache entry will be correct. If it uses two separate URLs, the existing per-URL caching pattern works as-is.

**Prevention:** Match the caching pattern to the URL structure. If each day has two URLs (WindRH + DryT), use the existing v1 pattern — cache each URL's result independently, merge in memory. If a day has a single combined URL, cache the single result. Do not cache the merged per-day value against either component URL.

**Phase:** Implementation task — verify URL count per day before writing cache store calls.

**Confidence:** MEDIUM — Based on analysis of current v1 caching pattern.

---

### Pitfall 5: `getDom()` No-Risk Guard Misses Extended Fire Weather Days

**What goes wrong:** The current no-risk guard in `getDom()` checks `fireWeather.day1Risk > 0 || fireWeather.day2Risk > 0` for fire weather. After adding Days 3–8, if a user is only in a Day 4 fire weather zone (but no Day 1/2 fire risk and no convective risk), the module still shows "No Severe Weather Risk."

**Why it happens:** The guard was written for Day 1–2 fire weather only. It is not automatically extended when new days are added to `fireWeather`.

**Consequences:** False negative — module says no risk when the user is in an extended fire weather zone. This directly violates the module's stated core value.

**Prevention:** When adding `fireWeather.day3Risk` through `fireWeather.day8Risk`, update the no-risk guard to include them. A helper like `Object.values(this.spcrisk.fireWeather).some(v => typeof v === 'number' && v > 0)` is more maintainable than listing each day explicitly, but explicit is also acceptable and consistent with the existing style.

**Detection:** Test with simulated non-zero extended fire weather risk and zero Day 1–2 fire/convective risk. If "No Severe Weather Risk" appears, the guard is incomplete.

**Phase:** Display implementation task — update guard in same commit as adding the display rows.

**Confidence:** HIGH — Direct analysis of `MMM-SPCOutlook.js` lines 55–58.

---

### Pitfall 6: `fireWeather` Return Object Only Grows in One of Two Return Paths

**What goes wrong:** `getSpcOutlook()` has two `return` blocks — one for `!extended` (line ~570) and one for `extended` (line ~725). The v1 implementation correctly adds `fireWeather` to both. If the developer adds Day 3–8 fire weather fields only to the extended return block, the non-extended return will have `fireWeather.day1Risk` and `fireWeather.day2Risk` but none of the new fields, causing `undefined` reads in `getDom()`.

**Why it happens:** The extended fire weather fetch block sits inside the `if (extended)` branch, so it is natural to assume only the extended return needs the new fields. But the display code accesses `fireWeather.day3Risk` etc. without checking the `extended` config flag.

**Prevention:** When adding `day3Risk`–`day8Risk` fields to the `fireWeather` object in the extended return, also add them (with value 0) to the non-extended return. Or define the fireWeather object once after both branches with a ternary. Keep both return paths structurally identical.

**Phase:** Implementation task — treat this as the same class of defect as the v1 "forgetting the second return statement" pitfall that was already documented.

**Confidence:** HIGH — Based on direct code inspection showing two return statements.

---

## Minor Pitfalls

### Pitfall 7: Display Clutter When All 6 Extended Days Show Risk

**What goes wrong:** If the user is in a large fire weather setup covering Days 3–8, the module renders 6 new fire weather rows below the existing convective and Day 1–2 fire weather rows. On a typical MagicMirror portrait display with a small font, 6 additional rows may overflow the widget or crowd out other modules.

**Why it happens:** The existing Day 1–2 fire weather display was designed with 2 rows in mind. The v1.1 requirement is "per-day display rows shown only when risk > 0 for user's location" — but during an active fire weather period in the western US, all 6 days can simultaneously have risk.

**Prevention:** This is a UX edge case, not a bug. The display-only-when-risk guard already limits output to active days. Document the all-days-active scenario in the validation checklist so it can be visually inspected before release. No code change required unless overflow is observed.

**Phase:** Validation task — manually verify display with all 6 days simulated as non-zero.

**Confidence:** MEDIUM — Based on display architecture analysis; actual overflow depends on user's display resolution and font size config.

---

### Pitfall 8: Cache Stampede at SPC's Nightly Fire Weather Issuance

**What goes wrong:** The Day 3–8 fire weather product is issued once daily at 2200 UTC. At that moment, all 12 URLs simultaneously return new content. On the next update cycle after 2200 UTC, every cache entry will be a miss, triggering 12 sequential fetches with full JSON parse and turf evaluation back-to-back. This is the worst-case CPU spike.

**Why it happens:** The cache is keyed per URL, and SPC rotates all files at once. There is no staggering.

**Prevention:** This is the same pattern already present for the 5 Day 4–8 convective files. The existing system already accepts this behavior. No change needed; just be aware the first update cycle after 2200 UTC will be slower than typical cycles.

**Phase:** No implementation work needed. Note in performance validation.

**Confidence:** MEDIUM — SPC issuance time confirmed from web search; exact impact on RPi cycle time is not yet measured.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| URL discovery | Endpoints may not exist or may differ from Day 1–2 naming | Verify all 12 URLs return HTTP 200 before writing fetch code |
| Schema verification | Extended GeoJSON LABEL values may be numeric probability strings, not ELEV/CRIT/EXTM | Inspect live GeoJSON before writing label mapper |
| Fetch implementation | Extended fetches in non-extended return path | Add all new `fireWeather` fields (as 0) to both return blocks |
| Display implementation | No-risk guard misses new days | Update guard to include `day3Risk`–`day8Risk` in same commit as display rows |
| Display implementation | All-6-days-active overflow | Add to validation checklist; check visually on target hardware |
| Performance validation | Cold-start cycle time | Measure total `getSpcOutlook()` duration on first run after restart |

---

## Sources

- Live codebase: `/home/kcreasey/OneDrive/Projects/weather/MMM-SPCOutlook/node_helper.js` — current v1 fire weather implementation, caching pattern, return structure (confirmed 2026-03-21)
- Live codebase: `/home/kcreasey/OneDrive/Projects/weather/MMM-SPCOutlook/MMM-SPCOutlook.js` — no-risk guard and fire weather display block (confirmed 2026-03-21)
- `.planning/milestones/v1.0-phases/03-fire-weather/03-RESEARCH.md` — v1 research explicitly flagging extended fire weather as out of scope with different URL pattern (HIGH confidence for endpoint structure claim)
- [SPC Fire Weather Outlooks page](https://www.spc.noaa.gov/products/exper/fire_wx/) — Day 3–8 extended product confirmation (MEDIUM confidence for URL structure)
- [SPC GIS Data](https://www.spc.noaa.gov/gis/) — authoritative GeoJSON endpoint list; absence of day3–8 lyr.geojson in search results is meaningful
- [fire_weather/SPC_firewx MapServer](https://mapservices.weather.noaa.gov/vector/rest/services/fire_weather/SPC_firewx/MapServer) — NOAA ArcGIS REST service for fire weather (alternative access path if direct GeoJSON files don't exist)
