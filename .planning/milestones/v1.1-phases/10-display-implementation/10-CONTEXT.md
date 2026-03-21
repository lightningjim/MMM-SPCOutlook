# Phase 10: Display Implementation - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Add Day 3–8 fire weather rows to `getDom()` in `MMM-SPCOutlook.js`, shown only when `extended: true` and that day's risk > 0. Extend the "No Severe Weather Risk" guard to include Day 3–8 risks. No backend changes.

</domain>

<decisions>
## Implementation Decisions

### Row label format
- **D-01:** Use `"Fire Wx (Day N):"` pattern — matches existing Day 1-2 fire weather rows. No day-of-week added.

### Row format and colors
- **D-02:** Exact pattern from existing Day 1-2 fire rows:
  ```javascript
  wrapper.innerHTML += "Fire Wx (Day N): <span style=\"color:#" +
    fireRiskToColor[this.spcrisk.fireWeather.dayNRisk] + "\">" +
    this.spcrisk.fireWeather.dayNText + "</span><br/>";
  ```
- **D-03:** Use existing `fireRiskToColor` map already defined at top of `getDom()`: `{ 0: "aaaaaa", 1: "FF7F00", 2: "FF0000", 3: "FF00FF" }`. No new color definitions needed.

### Placement
- **D-04:** Day 3–8 fire rows go after the Day 2 fire row, inside the existing `if (this.config.extended)` block (or a new one wrapping the entire Day 3–8 fire section). Grouped with all fire weather rows at the bottom of the display.

### Display gate
- **D-05:** Each day rendered only when `this.spcrisk.fireWeather.dayNRisk > 0`. No "Fire Wx (Day N): None" rows — zero risk days are silent.

### "No Severe Weather" guard
- **D-06:** Extend the existing guard (lines 52–58) to include Day 3–8 fire risks when `extended: true`. If a user has `extended: true` and only Day 3–8 fire weather risk (no convective, no Day 1-2 fire), they must NOT see "No Severe Weather Risk". Add:
  ```javascript
  !(this.config.extended && this.spcrisk.fireWeather && (
    this.spcrisk.fireWeather.day3Risk > 0 ||
    this.spcrisk.fireWeather.day4Risk > 0 ||
    this.spcrisk.fireWeather.day5Risk > 0 ||
    this.spcrisk.fireWeather.day6Risk > 0 ||
    this.spcrisk.fireWeather.day7Risk > 0 ||
    this.spcrisk.fireWeather.day8Risk > 0
  ))
  ```

### Claude's Discretion
- Whether to loop over days 3-8 or write explicit per-day blocks (either is acceptable given only 6 days)

</decisions>

<specifics>
## Specific Ideas

- Day 3–8 fire rows are visually identical to Day 1-2 fire rows — same format, same colors, just different day numbers and different data fields
- The `fireRiskToColor` map and `dayNText` strings from the backend handle all visual differentiation

</specifics>

<canonical_refs>
## Canonical References

### Existing display code (pattern to replicate)
- `MMM-SPCOutlook.js` lines 46, 102–113 — `fireRiskToColor` map and Day 1-2 fire weather rows (exact pattern for Day 3-8)
- `MMM-SPCOutlook.js` lines 52–58 — "No Severe Weather Risk" guard (to extend)

### Requirements
- `.planning/REQUIREMENTS.md` — FWXT-03 (display rows), success criteria 1-4

### Backend return shape
- `.planning/phases/09-backend-implementation/09-01-PLAN.md` — `fireWeather` object shape with `day3Risk`–`day8Risk` + `day3Text`–`day8Text` fields

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `fireRiskToColor`: already declared at `getDom()` line 46 — reuse as-is
- `dayNText` strings: provided by backend via `fireValueToFull` — no frontend conversion needed
- `if (this.config.extended)` block: already exists at line 94 — Day 3-8 fire rows belong here or in a parallel block

### Established Patterns
- Fire weather rows: `"Fire Wx (Day N): <span style=\"color:#X\">TEXT</span><br/>"` — exact copy pattern
- Display guard per-day: `if (dayNRisk > 0)` — same as Day 1-2

### Integration Points
- Guard at line 52: add Day 3-8 OR condition into existing multi-line boolean
- After line 112 (end of Day 2 fire block): add Day 3-8 fire rows inside `if (this.config.extended)`
- No changes to `node_helper.js` or any other file

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 10-display-implementation*
*Context gathered: 2026-03-21*
