# Phase 11: Stale Data Indicator - Context

**Gathered:** 2026-04-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver two coupled changes so the user can tell at a glance when displayed risk data is stale, with an accurate stale window:

1. **Backend bug fix (STALE-01):** `_isWithinStaleWindow` must use the user's configured `updateInterval` instead of silently falling back to 60 minutes. The frontend's `this.config.updateInterval` is not visible to `node_helper.js` today — it must be threaded through the `GET_SPC_DATA` socket payload.
2. **Frontend indicator (STALE-02, STALE-03):** Render a compact warning at the top of the module wrapper when the backend reports `_stale === true`, including a relative last-fresh-fetch time sourced from `_staleAsOf` via the vendored `moment` global.

In scope: changes to `node_helper.js` (`_isWithinStaleWindow`, `socketNotificationReceived`) and `MMM-SPCOutlook.js` (`start`, `getDom`).

Out of scope: per-row staleness UX, redesign of the existing risk display, automated test framework.

</domain>

<decisions>
## Implementation Decisions

### Backend interval threading (STALE-01)
- **D-01:** Thread `updateInterval` from frontend → `GET_SPC_DATA` payload → backend. The frontend currently sends `{ lat, lon, extended }` in two places (`start`, `setInterval`); both must include `updateInterval`.
- **D-02:** Change `_isWithinStaleWindow` signature to accept the interval explicitly: `_isWithinStaleWindow(timestamp, intervalMinutes)`. Pass-as-parameter is preferred over reusing `this.config` because `node_helper` does not own a `config` of its own and the existing `this.config?.updateInterval` lookup is the source of the bug.
- **D-03:** Cache the latest `updateInterval` on `this._updateInterval` (or equivalent) at `socketNotificationReceived` time so `_isWithinStaleWindow` can be called from the existing `fetchGeoJsonCached` paths without plumbing the value through every call site. The helper still takes the interval as an explicit parameter — the cached field is just the source for the four current call sites in `fetchGeoJsonCached`.
- **D-04:** If `GET_SPC_DATA` arrives without `updateInterval` (defensive — e.g. mismatched frontend version), default to 60 minutes to preserve current behavior. Log once at info level when the fallback is taken.

### Indicator visual style (STALE-02)
- **D-05:** Render an inline icon-and-text line at the top of the wrapper, e.g. `⚠ Stale — 12 minutes ago`. Single line, matches the existing `MD in effect` pattern.
- **D-06:** Use the Unicode `⚠` character (U+26A0). No font dependency, no new asset.
- **D-07:** Color the indicator warning yellow via inline `style="color:#FFCC00"` (or a similarly amber hex). Yellow reads as "attention, not error" — appropriate for a cache-fallback or interval-bounded staleness signal.
- **D-08:** Use inline `style` attributes — do **not** introduce `MMM-SPCOutlook.css` or a `getStyles()` registration. The rest of the module styles everything inline, and adding a CSS file just for this one indicator would introduce a pattern the rest of the file does not use.

### Relative-time refresh cadence (STALE-03)
- **D-09:** Compute the relative-time string at `getDom()` time and leave it static until the next `updateDom()` call (driven by `SPC_DATA_RESULT`). No new `setInterval` for ticking the indicator. Fresh data resets the indicator anyway, so a between-fetch drift of up to one `updateInterval` is acceptable.
- **D-10:** Use `moment(_staleAsOf).fromNow()` for the relative string. `moment` is the MagicMirror²-vendored global — no new dependency.

### Edge cases & fallback text
- **D-11:** When `_stale === true` but `_staleAsOf` is missing or not a valid timestamp: render the indicator without a time suffix (e.g. `⚠ Stale data`). Do not suppress — surface the staleness without fabricating a freshness number.
- **D-12:** When the computed `Date.now() - _staleAsOf` is negative (clock skew, timestamp in the future): coerce to "just now" or equivalent rather than rendering `moment`'s default "in X minutes" string. The warning + future-tense relative time is contradictory and confusing.
- **D-13:** When `_stale === false` or the field is omitted, render no indicator (per success criterion 4 in ROADMAP.md).
- **D-14:** Both staleness sources (cache-fallback from network failure, and the corrected stale-window check after STALE-01 fix) share the same UI path. The frontend reads `_stale`/`_staleAsOf` and does not care about the source. No reason field is added to the backend payload.

### Claude's Discretion
- Exact hex for "warning yellow" — `#FFCC00` is a starting point; planner/executor may pick any amber that contrasts on a black MagicMirror background.
- Exact wording inside the indicator span (e.g. `⚠ Stale — 12 minutes ago` vs `⚠ Data may be stale (12 minutes ago)`) — pick a concise variant consistent with the existing inline lines.
- Whether to factor the indicator into a small helper inside `getDom()` or inline it before the `if (!this.spcrisk)` branch — both fine.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase requirements & roadmap
- `.planning/REQUIREMENTS.md` §Stale Data (STALE) — STALE-01, STALE-02, STALE-03 acceptance text
- `.planning/ROADMAP.md` §Phase 11: Stale Data Indicator — goal and success criteria

### Source files in scope
- `node_helper.js` lines 28–37 (`socketNotificationReceived`) — where `updateInterval` enters the backend
- `node_helper.js` lines 159–162 (`_isWithinStaleWindow`) — buggy implementation
- `node_helper.js` lines 169–202 (`fetchGeoJsonCached`) — call sites for the helper; emits `_stale`/`_staleAsOf`
- `node_helper.js` lines 617, 784 — where `_stale: true, _staleAsOf: Date.now()` are added to the result object
- `MMM-SPCOutlook.js` lines 9–16 (`start` + `setInterval`) — where the frontend sends `GET_SPC_DATA`; needs `updateInterval` added to both payloads
- `MMM-SPCOutlook.js` lines 34–133 (`getDom`) — where the indicator is rendered; insertion point is at the top of the wrapper, before existing branches

### Project-level
- `.planning/PROJECT.md` §Constraints — Raspberry Pi platform, MagicMirror² conventions
- `.planning/PROJECT.md` §Known tech debt — names this exact indicator gap

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable assets
- `moment` global — already used elsewhere in MagicMirror²; `moment(timestamp).fromNow()` produces the desired "12 minutes ago" string
- Inline `style="color:#xxxxxx"` pattern — used for every colored span in `getDom` today; the indicator should follow the same pattern
- `_stale`/`_staleAsOf` are already populated in two paths in `node_helper.js` (lines 617, 784) — no backend payload changes are needed for the frontend indicator beyond what STALE-01 already requires

### Established patterns
- Frontend builds output via `wrapper.innerHTML += "..."` in `getDom()`. The indicator should use the same approach (prepend with `=` first, then `+=` for subsequent lines).
- Backend reuses one helper (`_isWithinStaleWindow`) across multiple call sites in `fetchGeoJsonCached`. Updating the signature is acceptable as long as all call sites are updated together.
- `GET_SPC_DATA` payload is constructed in two places (`start` and the `setInterval` callback in `MMM-SPCOutlook.js`). Both must include `updateInterval`.

### Integration points
- `node_helper.js` `socketNotificationReceived` (line 30) — destructure `updateInterval` from payload alongside the existing `lat, lon, extended`. Persist on `this._updateInterval` for use by `fetchGeoJsonCached`.
- `MMM-SPCOutlook.js` `getDom` — insertion point is at the start of the `else` branch (line ~70) right before the MD loop, OR before the existing branches near line 47, depending on whether the indicator should also show during the `Loading…`/`Error:`/`No Severe Weather Risk` states (success criteria do not require it during those states; placing it in the data-bearing branch is sufficient).

</code_context>

<specifics>
## Specific Ideas

- Indicator format target: `⚠ Stale — 12 minutes ago` (icon + dash + relative time). Inline yellow.
- Backend helper signature target: `_isWithinStaleWindow(timestamp, intervalMinutes)` with an explicit parameter, plus a private `this._updateInterval` field set at socket receipt.

</specifics>

<deferred>
## Deferred Ideas

- Per-row staleness UX (would require backend stale-aggregation refactor) — already noted in REQUIREMENTS.md `## Future Requirements (Deferred)`
- A separate "reason for staleness" field on the payload (network error vs interval lapse) — rejected as marginal-value complexity in this phase
- Ticking `setInterval` to keep the relative-time string current between fetches — rejected for simplicity; revisit if user reports the static string as misleading

</deferred>

---

*Phase: 11-stale-data-indicator*
*Context gathered: 2026-04-25*
