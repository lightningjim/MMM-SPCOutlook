---
phase: 19
fixed_at: 2026-09-08T01:14:21Z
review_path: .planning/phases/19-unified-day-report-getdom-rewrite/19-REVIEW.md
iteration: 1
findings_in_scope: 11
fixed: 9
skipped: 2
status: partial
probe_result_before: "157 passed, 0 failed, 0 skipped"
probe_result_after: "166 passed, 0 failed, 0 skipped"
---

# Phase 19: Code Review Fix Report

**Fixed at:** 2026-09-08T01:14:21Z
**Source review:** `.planning/phases/19-unified-day-report-getdom-rewrite/19-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 11 (4 critical, 7 warning; `fix_scope: critical_warning`, so the 5 Info findings were not attempted)
- Fixed: 9
- Skipped: 2

**Verification standard.** Every fix was verified with `node -c` plus a full run of
`scripts/probe-payload-resilience.js`, the project's mutation-tested probe suite (15 D-10 makes
it the phase's verification standard). Every new assertion was mutation-tested: the production
code was broken, the probe confirmed RED with the expected message, and the code was restored
and re-verified green. The suite went from **157 passed / 0 failed / 0 skipped** to
**166 passed / 0 failed / 0 skipped** (9 new scenarios; 7 pre-existing scenarios were amended,
see CR-03 below).

`node_helper.js`'s payload emission was deliberately **not** changed. It emits the full grid
regardless of product toggles by contract (`node_helper.js:4192-4198`), and cannot do otherwise:
`_products` is shared across MagicMirror instances of the same module type
(`node_helper.js:727`, "whichever polled first decided for both"). Fetch policy is the backend's;
display policy is per-instance and can only live in the frontend.

## Fixed Issues

### CR-01: Remote-derived proximity tier reaches `innerHTML` unescaped on a proximity-only day

**Files modified:** `MMM-SPCOutlook.js`, `scripts/probe-payload-resilience.js`
**Commit:** `5cd1506`
**Applied fix:** Wrapped the D-08 proximity-only branch's `proximityBadge(...)` in `escapeHtml`,
matching the three probabilistic sub-line call sites (T-19-18). I did **not** take the review's
"better" suggestion of escaping inside `proximityBadge()` itself: the label-field call sites
already inherit `detailColoredSpan`'s own `escapeHtml`, so moving it inside would double-escape
them and change shipped output. Instead the harness-level fix under WR-07 removes the
"remember to escape at four call sites" failure mode structurally.
Added `cr01-proximity-only-day-badge-escapes-a-hostile-tier-token` with a vacuity guard (the
badge *is* the whole line here, so a suppressed row would satisfy the escape assertions
trivially). Mutation-verified RED.

### CR-02 / CR-03 / CR-04: the day path's three dropped display gates

**Files modified:** `MMM-SPCOutlook.js`, `scripts/probe-payload-resilience.js`, `19-PARITY-CHECKLIST.md`
**Commit:** `bc609ce`
**Applied fix:** Fixed as **one structural change**, per the coordinator's direction, rather than
three parallel filters. All three exist because `renderDaySubRows` re-read `day.hazards` from
scratch and was therefore a second, divergent renderer of hazard entries that nothing kept in
agreement with `daySurvivors`.

- `hazardEntryDisplayable(h)` is now the single predicate holding all three gates: the
  `showMinorHeat` floor (CR-02), the `DAY_SOURCE_FLAGS` per-product toggle (CR-03), and
  `hazardsLabelDisplayable` (CR-04).
- `dayDisplayableHazards(day)` is every displayable entry — winners **and** suppressed
  competitors, because D-05's `also:` rows must still render and must be subject to the same
  gates as their winner.
- `daySurvivors(day)` is now literally `dayDisplayableHazards(day)` minus `suppressedBy !== null`.
- `renderDaySubRows` receives the list instead of deriving one.

Two deliberate scoping decisions, both grounded in committed artifacts rather than invented:
- The toggle mapping is `productRegistry.js`'s own `configFlag` per row. `spc-convective` and
  `spc-fire` have no `configFlag` and stay always-on (14 D-08). Reads use `!== true`, matching
  the existing `showDrought`/`showMinorHeat` convention.
- `hazardsLabelDisplayable` is applied only to `source === "wpc-hazards"` — the exact scope the
  pre-19 caller `renderableDayHazards` (`9143705:MMM-SPCOutlook.js:343-348`) had. Applying it to
  every source would let a listed label hide another product's entry, the one direction the
  fail-safe note at `MMM-SPCOutlook.js:503-508` forbids. A probe pins this.

**Seven pre-existing probe scenarios were amended.** Each used a toggle-gated fixture under a
config that left that toggle off and still expected it to render — i.e. each was silently
pinning the missing gate. Only their configs changed; their own subjects (day span, `" · "`
separator grammar, truncation, source attribution, competitor ordering) are untouched. Worth a
reviewer's attention as the clearest evidence of how invisible this regression was.

Three new scenarios, each mutation-verified RED against its own gate:
`cr03-day-rows-honor-every-per-product-toggle` (all-off / all-on / one-flag-at-a-time, plus a
non-boolean-flag case and an always-on-source vacuity guard),
`cr02-detail-sub-rows-share-the-compact-header-display-floor`,
`cr04-day-rows-apply-the-same-label-filter-as-the-window-band`.

**Parity checklist updated** (`19-PARITY-CHECKLIST.md`): rows 36, 37, 38 added to the main table
and to the Probe Coverage table; rows 24 and 30 corrected. Row 24 recorded only the band-side
caller and row 30 asserted the floor lived "inside `daySurvivors`" — those two omissions are
exactly why the regression went unnoticed, so both now carry a `CORRECTED` note saying so.

### WR-03: Dead code path in `_resolveGridDayPrecedence`

**Files modified:** `node_helper.js`
**Commit:** `ab2b71a`
**Applied fix:** Deleted the discarded `reportedForDay` computation and both empty branches; the
D-14 explanation moved into the JSDoc block above the method, restated as *why* the walk
deliberately does not distinguish the two paths. With the read gone, `dayNumber` and
`reportedDays` were decorative and are removed along with the argument at the sole call site.
Two comments elsewhere that named this method as a consumer of `reportedDays`/`activeDays` now
correctly name `_buildSourceHealth`, the only consumer left. No behavior change (both branches
were empty); all scenarios unchanged and green.

### WR-04: Detail-mode truncation counts padding

**Files modified:** `MMM-SPCOutlook.js`, `scripts/probe-payload-resilience.js`, `19-PARITY-CHECKLIST.md`
**Commit:** `08b4d43`
**Applied fix:** `detailColoredSpan` now escapes only; both call sites (winner row and `also:`
competitor row) truncate their own label content **before** padding. Added
`wr04-detail-label-truncation-counts-source-characters-not-padding`. Mutation-verified RED, and
the RED output is a clean demonstration of the bug: the same render showed 47 surviving
characters on the detail row against 55 on the compact line directly above it. Parity checklist
row 22 corrected — it recorded the compact-segment call site as the only one.

### WR-05: `_addSpcGridEntries` days 4-8 lack the containment its days 1-3 twin has

**Files modified:** `node_helper.js`, `scripts/probe-payload-resilience.js`
**Commit:** `cdb3e1d`
**Applied fix:** Mirrored the 1-3 branch — `hasOwnProperty` guard, the
`dimension/value/color: null` D-07 pass-through entry, and `notes.noteUnmapped`. Ordered *after*
the floor test rather than before it, unlike the 1-3 twin, because `"NONE"` is not a
`riskToValue` key there either and must stay a floor skip rather than become an unmapped token;
`noteActive` still fires only for a mapped, above-floor reading, matching 1-3's
reported-but-not-active treatment. Added
`spc-days-4-8-unmapped-risk-token-passes-through-like-days-1-3`, seaming `percToRisk` (the sole
producer of these tokens), with a precondition guard and a mapped-token control.
Mutation-verified RED, reproducing `value ... got undefined` exactly.

### WR-06: Renderers mutate an enclosing `wrapper` declared 200 lines below them

**Files modified:** `MMM-SPCOutlook.js`, `scripts/probe-payload-resilience.js`
**Commit:** `234a34b`
**Applied fix:** Both `renderDaySubRows` and `renderHazardsWindowBand` now return their markup;
the day loop and the band call site own every write to `wrapper`. `renderDaySubRows` additionally
takes the displayable list as a parameter, which is what makes the CR-02/CR-03/CR-04 class
unrepresentable rather than merely fixed. Output is byte-identical — all 163 pre-existing
scenarios passed unchanged. Added `wr06-day-and-band-renderers-are-pure-string-producers`, a
static source gate using `rpt01`'s comment-stripping technique, because an output-level probe
cannot distinguish "returned a string the caller appended" from "appended it itself".
Mutation-verified RED.

### WR-07: Probe harness cannot prove inertness, and scenarios share one helper

**Files modified:** `scripts/probe-lib/module-stubs.js`, `scripts/probe-payload-resilience.js`
**Commit:** `f72d923`
**Applied fix (a):** `renderDom` now runs every render through `assertInertMarkup`, a tag-level
allowlist of the four shapes `getDom()` is allowed to author. I did **not** add
`jsdom`/`linkedom`: adding a dependency to a harness whose stub file explicitly documents itself
as "dependency-free: `vm` and `fs` are core" is a project decision, and a lexical allowlist gets
most of the value with none of it. Since every payload-derived string reaching `innerHTML` must
pass the module's own `escapeHtml` (its WR-12 rule), an allowlist violation *is* an escaping
defect. `textContent` is exempt (inert by construction).

Two scenarios back it. `wr07-hostile-token-in-every-remote-string-still-renders-inert-markup`
puts a hostile token in every remote-derived display string of one payload at once — hazard
label/text/color/source, all five proximity tiers, both window-band forms, both advisory kinds,
every `sources[].displayName` — with every toggle on, detail mode on, proximity on and `_stale`
set, plus eight vacuity landmarks proving each branch actually ran. This is the direct answer to
"escaping is only proven where a scenario happened to look", which is the real reason CR-01
survived: not a missing assertion, but a benign fixture at the only scenario covering that call
site. `wr07-assert-inert-markup-...` self-tests the guard so it cannot rot into a no-op.

Mutation-verified RED twice, deliberately including a call site **no other scenario covers**
(`detailSourceAttribution`'s source-id fallback) — the CR-01 class exactly, now caught by the
sweep alone.

**Applied fix (b):** `resetHelper(helper)` moved into the runner loop before
`scenario.run(helper)`. Per-scenario calls are kept rather than deleted: several scenarios reset
*mid*-run to set up a control, and those calls are still load-bearing.

## Skipped Issues

### WR-01: A fully confirmed, fresh payload can render "(unconfirmed)"

**File:** `MMM-SPCOutlook.js:699-701, 851-853`
**Reason:** Skipped on the coordinator's explicit instruction — **blocked on a user product
decision.** I had implemented a candidate fix (gate the `contentMarker` fallback on
`summaryOk && !this.spcrisk._stale`, so a fresh payload emptied only by frontend filters gets
the confident `NO_HAZARD_TEXT` while a stale or malformed-summary payload keeps the unconfirmed
form) and reverted it uncommitted when the correction arrived.

**The user must see the coupling:** the CR-03/CR-04 fix *increases how often this fires.*
Restoring the per-product toggle and label gates means frontend-only filtering can now empty the
render on a fresh, fully confirmed payload — for example a user with every product toggle off
and a real convective-free day. Before this fix pass that combination rendered content it should
not have; now it renders `"No Hazards Forecast (unconfirmed)"`, which per the phase's own CR-01
doctrine is a word reserved for a read that was *not* confirmed. Resolving it properly needs a
decision the phase never made: a distinct third string, or splitting "nothing forecast" from
"nothing you have enabled" (which is arguably what the unreachable `enabledSourceCount === 0`
branch in WR-02 was reaching for). Both are new user-facing copy.

**Original issue:** The confident all-clear short-circuit reads `summary.anyHazard`, computed by
the backend before any frontend-only filter, so when `anyHazard === true` but every entry is
filtered out on the frontend, control falls into the main branch, nothing renders, and the
`contentMarker` fallback emits `"No Hazards Forecast (unconfirmed)"` on a payload that was fully
confirmed against upstream.

### WR-02: The "No Products Enabled" empty state is unreachable

**File:** `MMM-SPCOutlook.js:683-689`; `node_helper.js:3792, 3695-3700`
**Reason:** Skipped — **the correct resolution is a product decision the user has not made**, and
the briefing said to skip rather than guess in exactly this case. The finding is accurate:
`_buildSourceHealth` marks `spc-convective`/`spc-fire` `enabled: true` unconditionally, so
`enabledSourceCount` has a floor of 2 and the branch cannot fire against any real payload. But
both offered resolutions change product behavior in ways Phase 18 D-16 decided otherwise:

1. *Delete the branch and the probe, and drop the field from the D-16 contract.* This removes a
   documented payload field and the module's ability to ever distinguish "nothing was asked" from
   "checked and clear" — a distinction 18 D-16 deliberately introduced.
2. *Change the discriminator* (`reportingSourceCount === 0`, or a count restricted to
   toggle-gated sources). Each means something materially different on screen.
   `reportingSourceCount === 0` is a total-outage state, which is `_stale`'s job and would
   collide with CR-01's staleness doctrine. A toggle-gated count would make the string fire for a
   user running only the two always-on SPC products, telling them "No Products Enabled" while
   SPC convective is working — a false statement.

Option 2's toggle-gated variant is also now entangled with WR-01: with the CR-03/CR-04 gates
restored, "no toggle-gated product is enabled" and "everything was filtered out on the frontend"
are the same user-visible situation, so these two findings should be decided **together**, as one
copy decision, not resolved independently.

**Recommendation for the user:** decide WR-01 and WR-02 as a single question — what should the
display say when the payload is fresh and confirmed but this instance's own config leaves nothing
to show? Whichever string answers that also determines whether `enabledSourceCount` should be
repaired or retired.

## Not Attempted (out of scope)

`fix_scope` was `critical_warning`, so IN-01 through IN-05 were not attempted. IN-04
(`truncateHazardLabel` can split a surrogate pair) touches code this pass modified under WR-04
and is a two-line change (`Array.from(text).slice(...).join("")`); it is the cheapest of the five
to pick up in a follow-up.

---

_Fixed: 2026-09-08T01:14:21Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
