# Phase 13: Proximity Frontend Render - Pattern Map

**Mapped:** 2026-05-02
**Files analyzed:** 1 modified file (`MMM-SPCOutlook.js`); `node_helper.js` read-only for contract
**Analogs found:** 8 / 8 (every change site has a tight in-file analog — most within the same `getDom()` else-branch)

## Scope

Phase 13 modifies a single file: `MMM-SPCOutlook.js` (148 lines today). All analogs are in the same file and most live within `getDom()` itself. There are zero new files. The only cross-file read is `node_helper.js` to confirm the locked Phase 12 backend contract.

## File Classification

| Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------|------|-----------|----------------|---------------|
| `MMM-SPCOutlook.js` | frontend module (MagicMirror² `Module.register`) | render-only (consumes pre-resolved `this.spcrisk` payload) | self — Phase 11 stale-indicator render at lines 72–84, plus the existing `cigLabel`, umbrella check, and Day 1/2/3 row blocks | exact (in-file refactor + small additive helpers) |

## Pattern Assignments

The following sections map each Phase 13 change-site to its closest in-file analog and pull the byte-exact code the planner should reference.

---

### Site 1: `cigLabel` extension to accept tier-string input (D-08, D-12)

**File/lines:** `MMM-SPCOutlook.js` 41–46
**Role:** small-helper (arrow inside `getDom`)
**Data flow:** value-to-string mapping

**Current code (the analog and the modification target are the same lines):**

```js
const cigLabel = (cig) => {
  if (cig === 3) return "③ ";
  if (cig === 2) return "② ";
  if (cig === 1) return "① ";
  return "";
};
```

**What to copy:**

- The strict triple-equality, integer-keyed `if` ladder.
- The trailing space after each glyph (`"③ "`, not `"③"`) — load-bearing for inline concatenation in the existing `cigLabel(this.spcrisk.day1.torCig) + 100 * this.spcrisk.day1.torRisk + "% "` chain at lines 95–97.
- The empty-string default — callers concatenate unconditionally and rely on `""` for the no-CIG case.

**Two acceptable extensions (per D-12 — Claude's discretion):**

**Option A: extend in place, dual-input.** Keep the existing integer arm; add a leading string arm at the top so the helper accepts both `2` and `"CIG2"`:

```js
const cigLabel = (cig) => {
  if (cig === "CIG3") return "③ ";
  if (cig === "CIG2") return "② ";
  if (cig === "CIG1") return "① ";
  if (cig === 3) return "③ ";
  if (cig === 2) return "② ";
  if (cig === 1) return "① ";
  return "";
};
```

**Option B: parallel sibling helper.** Leave `cigLabel` untouched; add `cigLabelFromTierString` immediately below for proximity rendering:

```js
const cigLabelFromTierString = (tier) => {
  if (tier === "CIG3") return "③";
  if (tier === "CIG2") return "②";
  if (tier === "CIG1") return "①";
  return "";
};
```

**Note on trailing space:** Option B's outputs do **not** carry the trailing space, because the proximity-badge call sites embed the glyph inside formatted strings like `→ ② 0.7` and `0.6 (near ①)` where the surrounding format string controls spacing. Option A keeps the trailing space (preserves backward compatibility with lines 95–97/106–108) — the proximity-badge formatter would call it then `.trim()` if required, OR pass the integer-arm result through unchanged and let the format string absorb the trailing space. The planner picks one form; both honor PROJECT.md's `①②③` visual vocabulary and avoid divergence.

---

### Site 2: Umbrella "No Severe Weather Risk" check extension (D-06)

**File/lines:** `MMM-SPCOutlook.js` 53–67
**Role:** conditional gate
**Data flow:** boolean conjunction over payload subtree presence

**Current code:**

```js
} else if (
  this.spcrisk.day1.risk == "NONE" &&
  this.spcrisk.day2.risk == "NONE" &&
  this.spcrisk.day3.risk == "NONE" &&
  !( this.config.extended && this.spcrisk.day48Risk ) &&
  !(this.spcrisk.fireWeather && (this.spcrisk.fireWeather.day1Risk > 0 || this.spcrisk.fireWeather.day2Risk > 0)) &&
  !(this.config.extended && this.spcrisk.fireWeather && (
    this.spcrisk.fireWeather.day3Risk > 0 ||
    this.spcrisk.fireWeather.day4Risk > 0 ||
    this.spcrisk.fireWeather.day5Risk > 0 ||
    this.spcrisk.fireWeather.day6Risk > 0 ||
    this.spcrisk.fireWeather.day7Risk > 0 ||
    this.spcrisk.fireWeather.day8Risk > 0
  ))
) {
  wrapper.innerHTML = "No Severe Weather Risk"
}
```

**What to copy:**

- The pattern of stacking `&&` conjuncts, one per concern, with a leading `!(...)` for "absence of risk" assertions.
- The `&&`-of-`!(...)` style for the fire-weather subtree presence check — exactly the shape Phase 13's proximity check should mirror.
- The reliance on `this.spcrisk.<dayN>.<field>` direct access (no defensive `?.` chaining elsewhere in this block — the `this.spcrisk.day1` etc. are guaranteed present once the earlier `!this.spcrisk` and `this.spcrisk.error` early branches are passed).

**Modification target (per D-06):**

Append a new conjunct that asserts no proximity subtree on any of Days 1/2/3. The Phase 12 contract guarantees `'proximity' in dayN` is truthy iff the feature is on AND at least one hazard resolved (12-03-SUMMARY.md "Default-off byte-identity verification"). So a single absence check per day is sufficient:

```js
  !this.spcrisk.day1.proximity &&
  !this.spcrisk.day2.proximity &&
  !this.spcrisk.day3.proximity &&
```

Place these three lines anywhere within the `&&`-chain (before the `!fireWeather` checks reads naturally — group convective concerns together).

**Why this works without `?.`:** `day1`/`day2`/`day3` are always present on `this.spcrisk` per the Phase 12 return-object literal (`node_helper.js` 836–882 and 1031–1063). `proximity` is the only optional sibling — `!day1.proximity` is `true` for both `undefined` (feature off) and any falsy value. The Phase 12 helper `buildProximitySubtree` returns `{}` (no `proximity` key) when all hazards are null, so the property simply does not exist on those days — `!undefined === true` — covering the default-off and no-resolution cases.

---

### Site 3: Day 1 row gate relaxation + categorical inline badge (D-05, D-02, D-03)

**File/lines:** `MMM-SPCOutlook.js` 90–92
**Role:** conditional gate + render
**Data flow:** boolean gate → string concatenation into `wrapper.innerHTML`

**Current code:**

```js
if(this.spcrisk.day1.risk != "NONE") 
{
  wrapper.innerHTML += dowToText(dow) + " (Day 1): <span style=\"color:#" + this.spcrisk.day1.color + "\">" + this.spcrisk.day1.text + "</span><br/>";
```

**What to copy:**

- The `!=` (loose-not-equal) comparison style — match existing code; do not change to `!==`.
- The inline `style="color:#" + this.spcrisk.dayN.color + "\"` pattern — the backend already resolves the hex string for **every** risk including `NONE → "afddf6"` (per `node_helper.js` line 447 `riskToColor.NONE`), so the outside-tier row reuses the same span shape.
- The `dowToText(dow + offset) + " (Day N): "` prefix and the trailing `<br/>`.
- String concatenation with escaped double-quotes (`\"`) — no template literals are used anywhere in this file; do not introduce them.

**Gate relaxation (per D-05):**

```js
if(this.spcrisk.day1.risk != "NONE" || this.spcrisk.day1.proximity?.categorical) 
```

Note `?.` is acceptable here because `proximity` is the optional field; `day1` itself is always present. The optional-chain on `proximity` cleanly returns `undefined` when the subtree is omitted, which is falsy and short-circuits to the historical behavior.

**Inside-tier badge (per D-02 — append after the colored span, before the `<br/>`):**

When `dayN.risk != "NONE"` AND `dayN.proximity?.categorical` is present AND its weight ≥ noise floor, render:

```
... <span style="color:#<color>">Slight Risk</span> → ENH 0.7<br/>
```

Where `→ ENH 0.7` is the inside-tier badge — no `CURR` because the colored span just before names the current tier. The planner will compute `weight = value - Math.trunc(value)` and the format is:

```js
" → " + proximity.categorical.nextTier + " " + weight.toFixed(1)
```

**Outside-tier badge (per D-03 — when `risk == "NONE"` but `proximity.categorical` is present):**

The colored span renders the backend-emitted `"None"` text in `#afddf6` (already supplied by backend), then the badge follows — same site, same layout, different format string:

```
Mon (Day 1): <span style="color:#afddf6">None</span> 0.6 (near SLGT)<br/>
```

Format string: `" " + weight.toFixed(1) + " (near " + proximity.categorical.nextTier + ")"`.

**Concatenation pattern to match (analog: line 92):**

```js
wrapper.innerHTML += dowToText(dow) + " (Day 1): <span style=\"color:#" + this.spcrisk.day1.color + "\">" + this.spcrisk.day1.text + "</span>" + <inside-or-outside-badge> + "<br/>";
```

Same `+= ... + ... + "<br/>"` shape; the badge is one more concatenated piece between the closing `</span>` and the `<br/>`.

**Mode selection (per CONTEXT.md `<specifics>`):**

- Inside mode: `dayN.risk != "NONE"` (i.e., user is inside some categorical tier). Backend's `proximity.categorical.value` is `currentValue + weight ≥ 1`.
- Outside mode: `dayN.risk == "NONE"` (user outside all tiers). Backend's `proximity.categorical.value === weight < 1`.

**The Phase 12 D-07 strict cap on `weight < 1` makes the weight extraction uniform in both cases:** `weight = value - Math.trunc(value)`. For inside (`2.7`) → `2.7 - 2 = 0.7`. For outside (`0.6`) → `0.6 - 0 = 0.6`. No mode-specific math needed for the number; only the format string differs.

---

### Site 4: Day 1 per-hazard CIG proximity badges (D-09)

**File/lines:** `MMM-SPCOutlook.js` 93–98
**Role:** render (per-hazard probability row)
**Data flow:** sequential string concatenation per hazard

**Current code:**

```js
if(this.spcrisk.day1.probRisk) {
  let probRiskHTML = ""
  if (this.spcrisk.day1.torRisk > 0) probRiskHTML += "<i class=\"wi wi-tornado\"></i>" + cigLabel(this.spcrisk.day1.torCig) + 100 * this.spcrisk.day1.torRisk + "% ";
  if (this.spcrisk.day1.hailRisk > 0) probRiskHTML += "<i class=\"wi wi-meteor\"></i>" + cigLabel(this.spcrisk.day1.hailCig) + 100 * this.spcrisk.day1.hailRisk + "% ";
  if (this.spcrisk.day1.windRisk > 0) probRiskHTML += "<i class=\"wi wi-strong-wind\"></i>" + cigLabel(this.spcrisk.day1.windCig) + 100 * this.spcrisk.day1.windRisk + "% ";
  wrapper.innerHTML += probRiskHTML+"<br/>";
}}
```

**What to copy:**

- The `if (dayN.<hazard>Risk > 0)` per-hazard guard — Phase 13's per-hazard CIG badge nests **inside** this guard, so D-07's "suppress per-hazard CIG when underlying probability row absent" comes for free.
- The exact ordering: `<i class="wi wi-…"></i>` icon, then `cigLabel(dayN.<hazard>Cig)` for the current CIG glyph, then the percent.
- The trailing space on each row chunk (`+ "% "`) — load-bearing.
- The accumulator pattern: collect into `probRiskHTML`, append once at the end with a single `<br/>`.

**Modification target (per D-09):**

Insert a proximity-badge string between the existing `cigLabel(...)` output and the percent number. The badge encodes the proximity-CIG tier glyph and weight:

- Inside-tier (current cig > 0, higher CIG within 40 km): `→ ② 0.7` (or `③`, depending on `nextTier`).
- Outside-tier (current cig === 0, CIG polygon within 40 km): `0.6 (near ①)`.

**Target shape for the `torRisk > 0` arm:**

```js
if (this.spcrisk.day1.torRisk > 0) probRiskHTML += "<i class=\"wi wi-tornado\"></i>" + cigLabel(this.spcrisk.day1.torCig) + <torCig-proximity-badge-or-empty> + 100 * this.spcrisk.day1.torRisk + "% ";
```

Same idea for `hailRisk > 0` (using `day1.proximity?.hailCig`) and `windRisk > 0` (using `day1.proximity?.windCig`).

**Suppression rule (D-07 + PROXUI-05 noise floor):** the proximity-badge string is `""` when:
- The relevant proximity entry is absent (`!day1.proximity?.torCig`), OR
- The computed weight is `< PROX_MIN_WEIGHT` (D-13 noise floor).

In all other cases, the badge is rendered using the same inside/outside format selection logic as the categorical badge, but with `cigLabelFromTierString(proximity.<hazard>Cig.nextTier)` (or the extended `cigLabel`) producing the glyph instead of an abbreviated tier word.

---

### Site 5: Day 2 (mirror of Day 1)

**File/lines:** `MMM-SPCOutlook.js` 101–110
**Role:** render (Day 2 categorical row + per-hazard rows)
**Data flow:** identical to Day 1

**Current code (lines 101–110):**

```js
if(this.spcrisk.day2.risk != "NONE") 
{
  wrapper.innerHTML +=  dowToText(dow+1) + " (Day 2): <span style=\"color:#" + this.spcrisk.day2.color + "\">" + this.spcrisk.day2.text + "</span><br/>";
if(this.spcrisk.day2.probRisk) {
  let probRiskHTML = ""
  if (this.spcrisk.day2.torRisk > 0) probRiskHTML += "<i class=\"wi wi-tornado\"></i>" + cigLabel(this.spcrisk.day2.torCig) + 100 * this.spcrisk.day2.torRisk + "% ";
  if (this.spcrisk.day2.hailRisk > 0) probRiskHTML += "<i class=\"wi wi-meteor\"></i>" + cigLabel(this.spcrisk.day2.hailCig) + 100 * this.spcrisk.day2.hailRisk + "% ";
  if (this.spcrisk.day2.windRisk > 0) probRiskHTML += "<i class=\"wi wi-strong-wind\"></i>" + cigLabel(this.spcrisk.day2.windCig) + 100 * this.spcrisk.day2.windRisk + "% ";
  wrapper.innerHTML += probRiskHTML+"<br/>";
}}
```

**Pattern to copy:** identical to Site 3 + Site 4 — same gate relaxation (line 101 → `|| this.spcrisk.day2.proximity?.categorical`), same inside/outside categorical badge concatenation (line 103), same per-hazard inline CIG-proximity badge insertion (lines 106–108). The `dow+1` offset and `day2` field-name substitutions are the only differences from Day 1. Backend payload shape (`day2.proximity.categorical|torCig|hailCig|windCig`) is symmetric with Day 1.

---

### Site 6: Day 3 dual-badge inline layout (D-10)

**File/lines:** `MMM-SPCOutlook.js` 111–115
**Role:** render (Day 3 single-row categorical+cig)
**Data flow:** string concatenation with two badge slots inside one colored span

**Current code:**

```js
if(this.spcrisk.day3.risk != "NONE") 
{
wrapper.innerHTML += dowToText(dow+2) + " (Day 3): <span style=\"color:#" + this.spcrisk.day3.color + "\">" + this.spcrisk.day3.text + cigLabel(this.spcrisk.day3.cig) + "</span>";
wrapper.innerHTML += "<br/>";
}
```

**What to copy:**

- The unique-to-Day-3 single-row layout: `text` and `cigLabel(cig)` both nested **inside** the colored span. Day 1/2 keep `cigLabel` outside per row.
- The split into two `wrapper.innerHTML +=` statements (line 113 + line 114) — the trailing `<br/>` is appended on its own. Phase 13 must keep this split.
- The `dow+2` offset for Day 3.

**Modification target (per D-10):**

Two badge slots, semicolon-separated when both present:

- Categorical badge: same inside/outside format selection as Day 1/2, using `day3.proximity.categorical`.
- CIG badge: same per-hazard CIG badge format as Day 1/2 hazards, using `day3.proximity.cig` (Day 3 has a single CIG layer; Phase 12 emits `cig` not `<hazard>Cig`).

**Target inside-tier example (current cat tier present, current cig > 0, both proximities present):**

```
Wed (Day 3): <span style="color:#f7f690">Slight Risk② → ENH 0.6; → ③ 0.7</span><br/>
```

Note both badges live inside the colored span (matching the existing layout of `text + cigLabel(cig)` already inside the span). The `<br/>` stays on its own line as in line 114.

**Target outside-tier example (`risk == "NONE"`, both proximities present):**

```
Wed (Day 3): <span style="color:#afddf6">None 0.4 (near SLGT); 0.3 (near ①)</span><br/>
```

The semicolon-with-space (`"; "`) separator disambiguates the two arrows on a single line.

**Render gating (per D-05 + D-10):**

```js
if(this.spcrisk.day3.risk != "NONE" || this.spcrisk.day3.proximity?.categorical || this.spcrisk.day3.proximity?.cig)
```

Day 3 needs all three disjuncts because either proximity slot can be present without the other (and the row should render as long as anything is present).

**Suppression rules:**

- If only `proximity.categorical` is present (no `cig`): render the categorical badge alone, no semicolon, no cig badge.
- If only `proximity.cig` is present (no `categorical`): when `risk == "NONE"`, render `None <cig-badge>` (the `text` is "None" in light blue from backend). When `risk != "NONE"` and `cig > 0`, the existing `text + cigLabel(cig)` shows; append the cig-proximity badge directly after the cig glyph.
- Both present: semicolon-separator `"; "` between them.

---

### Site 7: Outside-tier row insertion (D-05)

**File/lines:** *new code paths* — no in-file analog for this branching shape, but the **render code** is identical to Sites 3/5/6.

**What changes:** the `if(this.spcrisk.dayN.risk != "NONE")` gate at lines 90, 101, 111 becomes `||`-extended to include `proximity?.categorical` (and for Day 3, also `proximity?.cig`). When the gate passes via the proximity disjunct (and `risk == "NONE"`), the **same body** runs — the `dayN.text` field is `"None"` and `dayN.color` is `"afddf6"` (per `node_helper.js` lines 13 + 447). The colored span renders `None` in light blue, then the outside-tier badge format `0.6 (near SLGT)` is appended exactly as in Site 3.

**Why no separate code path:** by reusing the same render body and exploiting the fact that backend always populates `text` and `color` (including for `NONE`), the outside-tier row shares a single code path with the inside-tier row. The format-string selection (inside vs. outside) is the only branch — it depends on `dayN.risk == "NONE"` (or equivalently on whether the proximity value is `>= 1` or `< 1`).

**Concrete inside/outside selector:**

```js
const isOutside = (this.spcrisk.day1.risk == "NONE");
const badge = isOutside
  ? " " + weight.toFixed(1) + " (near " + prox.nextTier + ")"
  : " → " + prox.nextTier + " " + weight.toFixed(1);
```

Either inline at each site or hoisted into the `proximityBadge(prox, mode)` helper from D-11.

---

### Site 8: `PROX_MIN_WEIGHT` noise floor constant (D-13, PROXUI-05)

**File/lines:** *new* — top of `getDom()` (or module scope above `Module.register`)
**Role:** constant
**Data flow:** none (compile-time literal)

**Closest analog in this file** (already in `getDom`, lines 36–47):

```js
getDom: function() {
  const dowToText = (day) => {
    const weekday = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    if (day >= 7) day -= 7;
    return weekday[day];
  }
  const cigLabel = (cig) => {
    if (cig === 3) return "③ ";
    if (cig === 2) return "② ";
    if (cig === 1) return "① ";
    return "";
  };
  const fireRiskToColor = { 0: "aaaaaa", 1: "FF7F00", 2: "FF0000", 3: "FF00FF" };
```

**Pattern to copy:**

- Top-of-`getDom()` `const` declaration block — `dowToText`, `cigLabel`, `fireRiskToColor` all live there.
- One-line `const NAME = value;` declaration with no JSDoc — matches the terseness of `fireRiskToColor` line 47.
- Camel-case is the convention everywhere else in this file (`dowToText`, `cigLabel`, `fireRiskToColor`, `probRiskHTML`); `PROX_MIN_WEIGHT` SCREAMING_SNAKE_CASE is a one-off for this kind of magic-number constant. The Phase 12 backend uses `PROX_*` style constants similarly (e.g., the `40 km` cutoff is hard-coded but documented). Either style is acceptable; recommend `PROX_MIN_WEIGHT` to clearly mark it as a tunable threshold versus the surrounding lookup tables/helpers.

**Target placement (recommended — line 47 area, immediately after `fireRiskToColor`):**

```js
const fireRiskToColor = { 0: "aaaaaa", 1: "FF7F00", 2: "FF0000", 3: "FF00FF" };
const PROX_MIN_WEIGHT = 0.1;
```

**Suppression usage (across Sites 3–6):**

```js
const weight = prox.value - Math.trunc(prox.value);
if (weight < PROX_MIN_WEIGHT) return "";  // suppress badge entirely; do NOT render "0.0"
```

---

### Site 9 (Claude's discretion — D-11): `proximityBadge` helper

**File/lines:** *new, optional* — top of `getDom()` next to `cigLabel`
**Role:** small-helper (arrow inside `getDom`)
**Data flow:** value-to-string formatting

**Closest analog:** the existing `cigLabel` at lines 41–46 — same shape (arrow function bound to a `const`, lives at the top of `getDom`, returns a `""` for the no-render case, otherwise a formatted string).

**Recommended target shape:**

```js
const proximityBadge = (prox, mode) => {
  if (!prox) return "";
  const weight = prox.value - Math.trunc(prox.value);
  if (weight < PROX_MIN_WEIGHT) return "";
  const tierLabel = prox.nextTier.startsWith("CIG")
    ? cigLabelFromTierString(prox.nextTier)  // or extended cigLabel(prox.nextTier)
    : prox.nextTier;
  if (mode === "outside") return " " + weight.toFixed(1) + " (near " + tierLabel + ")";
  return " → " + tierLabel + " " + weight.toFixed(1);
};
```

**Why a helper is preferred (D-11):** the inside/outside formatter is invoked at 4+ sites (Day 1 categorical, Day 1 tor/hail/wind, Day 2 categorical, Day 2 tor/hail/wind, Day 3 categorical, Day 3 cig — 8 sites). Inlining the format at each one would multiply the noise-floor short-circuit and the `weight = value - Math.trunc(value)` line. A single helper centralizes the suppression rule and the rounding rule (PROXUI-05).

**Why `cigLabel` as the analog:** it's the closest function in the file that returns a formatted small string keyed off a single payload field, with an empty-string default for the no-render case. Same pattern, same scope (inside `getDom`), same `const NAME = (args) => {...}` shape.

---

### Site 10: PROXUI-01 verification (no code change — D-15)

**File/lines:** `MMM-SPCOutlook.js` lines 7, 14, 16

**Current state — already correct (shipped in Phase 12 plan 12-02):**

Line 7: `proximityWeighting: false` in `defaults`.

Lines 14, 16:

```js
this.sendSocketNotification("GET_SPC_DATA", { lat: this.config.lat, lon: this.config.lon, extended: this.config.extended, updateInterval: this.config.updateInterval, proximityWeighting: this.config.proximityWeighting });
// ...
setInterval(() => {this.sendSocketNotification("GET_SPC_DATA", { lat: this.config.lat, lon: this.config.lon, extended: this.config.extended, updateInterval: this.config.updateInterval, proximityWeighting: this.config.proximityWeighting });}, this.config.updateInterval * 60000);
```

**What the planner does:** include a one-line verification step (e.g., a `grep -c "proximityWeighting" MMM-SPCOutlook.js` returning ≥ 3) to confirm PROXUI-01 is satisfied. No code modification.

---

## Shared Patterns

### Inline `style="color:#xxxxxx"` only — no CSS file (D-08 of Phase 11)

**Source:** `MMM-SPCOutlook.js` lines 83 (stale), 87 (MD), 92/103/113 (day rows), 118–122 (day 4–8), 126–142 (fire wx)

**Apply to:** every Phase 13 badge — both inside-tier and outside-tier strings.

Every coloured element in the module uses inline `style` with a hex literal. Stale uses `#FFCC00`; risk rows interpolate the backend-supplied `dayN.color`. Phase 13's badges inherit color from the surrounding span (D-14) — i.e., **no new color rules**. Inside-tier badges sit inside the existing colored risk span (Day 3) or after it (Day 1/2); outside-tier badges sit after the light-blue span and pick up the wrapper's default color.

**Constraint (D-08 reaffirmed for Phase 13):** do **not** introduce `MMM-SPCOutlook.css` or extend `getStyles()`. The existing `getStyles()` (lines 29–33) is reserved for `weather-icons.min.css`.

### `wrapper.innerHTML += "..."` accumulation pattern

**Source:** `MMM-SPCOutlook.js` lines 71–144 (every render line in the data-bearing else-branch)

**Apply to:** every Phase 13 badge insertion.

The pattern is `wrapper.innerHTML = ""` once at line 71 (reset), then `+=` for everything thereafter. Phase 13 badges concatenate as additional `+ <badge-string> +` segments inside existing `wrapper.innerHTML += ...` statements (Sites 3, 5) OR as new dedicated `+=` statements (Site 6's split across lines 113–114). No `=` reassignment after line 71.

### Optional-chaining for optional payload fields

**Source:** *introduced by Phase 13* — no existing analog uses `?.`, but the convention is well-known in MagicMirror² modules and harmonizes with the Phase 12 contract that `proximity` is the only optional field.

**Apply to:** every read of `this.spcrisk.dayN.proximity?.<key>`.

The only optional field on a `dayN` object is `proximity` itself. All other fields (`risk`, `text`, `color`, `torRisk`, `torCig`, `hailRisk`, `hailCig`, `windRisk`, `windCig`, `probRisk`, `cig` for Day 3) are unconditionally populated by the Phase 12 return spreads. So `dayN.proximity?.categorical` is the natural read shape — `undefined` when feature off OR no resolution, `{ value, nextTier }` otherwise. No deeper optional chain is needed.

### Defensive type-check + edge-case fallback (Phase 11 stale-indicator pattern)

**Source:** `MMM-SPCOutlook.js` lines 72–84

```js
if (this.spcrisk._stale) {
  let staleSuffix = "";
  const asOf = this.spcrisk._staleAsOf;
  if (typeof asOf === "number" && isFinite(asOf)) {
    const delta = Date.now() - asOf;
    if (delta < 0) {
      staleSuffix = " — just now";
    } else {
      staleSuffix = " — " + moment(asOf).fromNow();
    }
  }
  wrapper.innerHTML += "<span style=\"color:#FFCC00\">⚠ Stale" + staleSuffix + "</span><br/>";
}
```

**Apply to:** Phase 13 proximity-badge formatting — analogous "is the value safe to render" question.

The Phase 11 pattern guards against:
1. Field present but wrong type (`typeof asOf === "number"`).
2. Field present but degenerate (`isFinite(asOf)` rejects NaN/Infinity).
3. Logical edge case (negative delta — clock skew → "just now" fallback).

**Phase 13 analogous guards:**

```js
if (!prox) return "";  // field absent or null — Phase 12 contract guarantees null is omitted, but defend anyway
if (typeof prox.value !== "number" || !isFinite(prox.value)) return "";  // bad value
if (typeof prox.nextTier !== "string" || prox.nextTier.length === 0) return "";  // bad label
const weight = prox.value - Math.trunc(prox.value);
if (weight < PROX_MIN_WEIGHT) return "";  // PROXUI-05 noise floor — analogous to "delta < 0 → just now" early branch
```

The `weight < PROX_MIN_WEIGHT → ""` short-circuit is the Phase 13 analog to the Phase 11 negative-delta short-circuit. Both are "the field is technically present and well-typed but the value falls outside the renderable range, so degrade gracefully."

### Concatenation, not template literals

**Source:** `MMM-SPCOutlook.js` lines 22, 83, 87, 92, 95–97, 103, 106–108, 113, 118–122, 126–142.

**Apply to:** every Phase 13 string assembly.

The file uses `"..." + variable + "..."` exclusively. Backticks (`) appear only in two places (lines 12 — a `Log.info` template literal in `start`; and... that's the only place). Phase 13 must follow the existing concatenation style inside `getDom`.

### Loose equality (`==`/`!=`) in this file

**Source:** `MMM-SPCOutlook.js` lines 54–56, 90, 101, 111.

**Apply to:** Phase 13's gate extensions (`risk != "NONE"`).

The file uses `==`/`!=` (loose) for risk-string comparisons, not `===`/`!==`. Phase 13 must match — gate extensions read `dayN.risk != "NONE" || dayN.proximity?.categorical`, not `!==`. This is purely cosmetic (both are equivalent for string comparisons) but consistent with the established style.

### Backend contract reference (read-only)

**Source:** `node_helper.js` lines 142–176 (`computeProximity` — emits `{ value, nextTier }` or `null`); lines 485–492 (`buildProximitySubtree` — null-omission discipline); lines 847–852, 865–870, 878–881 and 1031+ (return spreads — `proximity` key only present when at least one hazard resolved).

**Implication for Phase 13:** the frontend can rely on:

1. `'proximity' in dayN` is truthy iff the feature is on AND at least one hazard resolved.
2. Each present key inside `proximity` (`categorical`, `torCig`, `hailCig`, `windCig`, `cig`) is guaranteed `{ value: number, nextTier: string }` — never `null`, never partial.
3. `value` is in the range `(0, 1)` for outside-tier (currentValue===0), `[currentValue+ε, currentValue+1)` for inside-tier where `weight === value - Math.trunc(value)` strictly. The backend's D-07 strict cap (`weight < 1`) means this extraction is exact, not approximate.
4. `nextTier` is one of `{TSTM, MRGL, SLGT, ENH, MDT, HIGH}` for categorical (per `node_helper.js` line 16 `valueToRisk`) or one of `{CIG1, CIG2, CIG3}` for CIG hazards (per `node_helper.js` line 432 `cigToTier`).

Phase 13 does not need defensive checks against `null` proximity entries — the Phase 12 helper drops them. But the Phase 11–style `typeof === "number"` defensive shape is still cheap and worth keeping, since malformed payloads from a future bug would otherwise crash the render.

---

## Cross-File Invariants

- **Phase 13 reads, never writes, the backend contract.** `node_helper.js` is unmodified. Phase 12 sealed `{ value: number, nextTier: string }` and the null-omission shape; Phase 13 must consume exactly that and break only if the contract is violated.
- **No new files.** Single-file change set. Every analog is in `MMM-SPCOutlook.js`. The closest cross-phase analog is Phase 11's stale-indicator render at lines 72–84 (defensive type-check pattern).
- **Format-string parity with PROJECT.md / ROADMAP.md UX targets.** The `→ ENH 0.7` and `0.6 (near SLGT)` examples in `.planning/PROJECT.md` §Active and `.planning/ROADMAP.md` Phase 13 success criterion 3 are byte-exact targets. The format strings in Sites 3/5/6 must produce these exact outputs given the documented inputs.
- **PROXUI-01 = verification only.** Lines 7/14/16 already carry `proximityWeighting`. The planner adds a verification step, not a code edit.

---

## No Analog Found

None. Every Phase 13 change has a tight in-file analog:

| Phase 13 Concern | In-File Analog |
|------------------|----------------|
| Small format helper bound to `const` arrow inside `getDom` | `cigLabel` (lines 41–46), `dowToText` (lines 36–40) |
| Top-of-`getDom` constant | `fireRiskToColor` (line 47) |
| Umbrella check extension via additional `&&` conjuncts | The fire-weather conjuncts already in lines 58–66 |
| Inline-badge concatenation after a colored span | The MD-line render (line 87), every dayN row (lines 92, 103, 113) |
| Per-hazard inline render alongside `cigLabel` | Already-existing per-hazard rows (lines 95–97, 106–108) — Phase 13 just inserts one more concat segment per row |
| Defensive type-check for safe-to-render | Phase 11 stale block (lines 72–84) |
| Optional-chain on payload field | First introduction in this file, but standard JS idiom and the only field requiring it |

The planner does not need to fall back on `RESEARCH.md` patterns — every change has a concrete in-file template.

---

## Metadata

**Analog search scope:** `MMM-SPCOutlook.js` (148 lines, fully read), `node_helper.js` (read-only contract — lines 10–46, 120–195, 478–545, 840–882; 1145 lines total, targeted reads only)

**Files scanned:** 1 source file modified, 1 source file consulted read-only, 4 phase docs (Phase 11 PATTERNS, Phase 12 PATTERNS, Phase 12 CONTEXT, Phase 12-03 SUMMARY), 4 planning docs (REQUIREMENTS, ROADMAP, PROJECT, conventions), 1 phase context (13-CONTEXT)

**Pattern extraction date:** 2026-05-02
