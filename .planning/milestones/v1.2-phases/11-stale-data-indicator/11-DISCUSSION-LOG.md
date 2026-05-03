# Phase 11: Stale Data Indicator - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-25
**Phase:** 11-stale-data-indicator
**Areas discussed:** Backend interval threading, Indicator visual style, Relative-time refresh cadence, Edge cases & fallback text

---

## Backend interval threading (STALE-01)

### Q: How should updateInterval reach _isWithinStaleWindow?

| Option | Description | Selected |
|--------|-------------|----------|
| Pass as parameter | Change signature to `_isWithinStaleWindow(timestamp, intervalMinutes)`; store latest interval on `this._updateInterval`. Minimal coupling, explicit dataflow. | ✓ |
| Store on this.config | Set `this.config = { updateInterval }` at receipt; helper keeps reading `this.config?.updateInterval`. Smallest diff, but reuses misleading 'config' name. | |
| Per-call snapshot via closure | Capture in `socketNotificationReceived` and pass through `fetchGeoJsonCached`. Most explicit, ripples through 4 sites. | |

**User's choice:** Pass as parameter (Recommended)
**Notes:** The existing `this.config?.updateInterval` lookup is precisely the source of the bug — `node_helper` has no `config` of its own. Explicit parameter avoids reusing the misleading name.

### Q: What should the backend do if a GET_SPC_DATA payload arrives without updateInterval?

| Option | Description | Selected |
|--------|-------------|----------|
| Default to 60 | Preserve current safe fallback (matches frontend default). Log once at info level. | ✓ |
| Reject the request | Return error if missing. Strictest, introduces coupling failure. | |
| Use last seen value | Cache last good interval. Adds state, overkill for single-frontend module. | |

**User's choice:** Default to 60 (Recommended)
**Notes:** Defensive against frontend version skew. Logs the fallback so it's visible if it ever happens in practice.

---

## Indicator visual style (STALE-02)

### Q: What should the stale indicator look like?

| Option | Description | Selected |
|--------|-------------|----------|
| Icon + text inline | e.g. `⚠ Stale — 12 minutes ago` as a single line. Matches existing 'MD in effect' line style. | ✓ |
| Text-only line | e.g. `Data may be stale (12 minutes ago)` — no icon. Simplest. | |
| Compact pill/badge | Bordered/background-colored span with padding. Most distinct, requires CSS rule or verbose inline style. | |

**User's choice:** Icon + text inline (Recommended)

### Q: What color/contrast for the indicator?

| Option | Description | Selected |
|--------|-------------|----------|
| Warning yellow | Inline `style="color:#FFCC00"`. 'Attention, not error'. | ✓ |
| Muted gray | Low-emphasis, risks being missed. | |
| Red / error | High-emphasis, risks crying wolf. | |

**User's choice:** Warning yellow (Recommended)

### Q: CSS approach for any new styling?

| Option | Description | Selected |
|--------|-------------|----------|
| Inline style attributes | Match existing pattern in MMM-SPCOutlook.js. Zero new files. | ✓ |
| Add MMM-SPCOutlook.css + getStyles | Cleaner long-term, but adds a new file pattern the rest of the module doesn't use. | |

**User's choice:** Inline style attributes (Recommended)

### Q: Which icon for the stale warning?

| Option | Description | Selected |
|--------|-------------|----------|
| Unicode ⚠ | U+26A0 warning sign. Universal, no font dependency. | ✓ |
| weather-icons 'wi-na' | `<i class="wi wi-na"></i>` — stays in family with existing icons. | |
| No icon | Skip the icon entirely. | |

**User's choice:** Unicode ⚠ (Recommended)

---

## Relative-time refresh cadence (STALE-03)

### Q: Should the relative time tick between fetches, or stay static until the next data update?

| Option | Description | Selected |
|--------|-------------|----------|
| Static until next fetch | Computed at getDom time; refreshed when SPC_DATA_RESULT arrives. Simplest — zero new timers. | ✓ |
| Tick every minute | setInterval(60_000) calling updateDom while _stale is true. Keeps 'X min ago' honest. | |
| Show absolute time instead | 'fetched at 14:32'. Conflicts with STALE-03 wording. | |

**User's choice:** Static until next fetch (Recommended)
**Notes:** Fresh data resets the indicator anyway, so drift up to one `updateInterval` is acceptable. Avoids new timer-leak risk.

---

## Edge cases & fallback text

### Q: What if backend reports _stale===true but _staleAsOf is missing/invalid?

| Option | Description | Selected |
|--------|-------------|----------|
| Render indicator without time | `⚠ Stale data` (no relative-time suffix). Surfaces staleness without lying about freshness. | ✓ |
| Suppress indicator entirely | Hides real staleness if backend omits the timestamp. | |
| Show literal 'unknown' | Explicit but verbose. | |

**User's choice:** Render indicator without time (Recommended)

### Q: What if computed relative time is negative (clock skew, timestamp in future)?

| Option | Description | Selected |
|--------|-------------|----------|
| Treat as 'just now' | Coerce negative deltas. Avoids 'in X minutes' contradicting the warning. | ✓ |
| Pass through moment's default | Renders 'in X minutes'. Honest but confusing. | |
| Suppress indicator | Drops on small legitimate skew. | |

**User's choice:** Treat as 'just now' (Recommended)

### Q: Same indicator path for cache-fallback and interval-bounded staleness?

| Option | Description | Selected |
|--------|-------------|----------|
| Same indicator, same UI | User just sees 'stale + last fresh fetch'. Frontend reads _stale/_staleAsOf, doesn't care why. | ✓ |
| Differentiate in text | 'Stale (network)' vs 'Stale (cached)'. Adds backend complexity for marginal value. | |

**User's choice:** Same indicator, same UI (Recommended)

---

## Claude's Discretion

- Exact hex for "warning yellow" (starting point: `#FFCC00`)
- Exact wording inside the indicator span (`⚠ Stale — 12 minutes ago` vs alternatives)
- Whether to factor the indicator out of `getDom()` into a helper or inline it

## Deferred Ideas

- Per-row staleness UX (out of phase scope; in REQUIREMENTS.md Future)
- A "reason for staleness" field on the payload
- Ticking setInterval to keep the relative-time string current between fetches
