---
phase: 18-merge-precedence-unified-payload-schema
reviewed: 2026-09-06T14:52:49Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - node_helper.js
  - scripts/probe-payload-resilience.js
  - hazardTaxonomy.js
  - MMM-SPCOutlook.js
  - productRegistry.js
  - scripts/probe-lib/module-stubs.js
  - scripts/hazards-at.js
  - scripts/check-concurrency-invariant.sh
findings:
  critical: 0
  warning: 1
  info: 0
  total: 1
status: issues_found
---

# Phase 18: Code Review Report

**Reviewed:** 2026-09-06T14:52:49Z
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

This review overwrites the prior `18-REVIEW.md`, which predated the four gap-closure plans
(18-13..18-16). Per the review brief, I verified each of the four previously-reported blockers
against current source rather than re-deriving them from scratch:

- **CR-01** (unguarded reads of a nullable `Promise.allSettled` payload) — **confirmed fixed.**
  All three guards are present and correct: `_addRegistryDayGridEntries`'s head-of-function
  `if (!payload || typeof payload !== "object") return;` (node_helper.js:3293), the
  `eroPayload && eroPayload.day1ValidTime` log-sample guard (node_helper.js:4923), and the
  `hazardsPayload && hazardsPayload.windowBand` call-site guard into `_buildGridSummary`
  (node_helper.js:5076). Traced the call sites and the `Promise.allSettled` rejection
  substitution (`{ payload: null, entries: [], anyStale: true }`, node_helper.js:4903) and found
  no remaining unguarded read on this path.
- **CR-02** (HeatRisk's outermost tile dropped for the 00Z–12Z half of every UTC day) —
  **confirmed fixed.** `_addHeatRiskGridEntries` bounds solely by `GRID_DAY_COUNT`
  (node_helper.js:3007, `if (gridDay < 1 || gridDay > GRID_DAY_COUNT) continue;`), with no
  comparison against `row.days` anywhere in the function. The `merge-precedence-heatrisk-*`
  probe scenarios pass.
- **CR-03** (`_addHazardsOutlookGridEntries` treating `end_date` as exclusive) — **confirmed
  fixed.** The clamp now reads `const lastGridDay = gridEnd;` (node_helper.js:2899, D-21),
  matching `_bucketHazardMatch`'s own inclusive-both-ends day loop. The
  `merge-grid-hazards-start-equals-end-live-shape-lands-on-its-own-grid-day` and
  `merge-grid-hazards-multi-day-inclusive-span-matches-the-legacy-block` scenarios pass.
- **CR-04** (`_spcGridAnchor` trusting an already-elapsed `EXPIRE_ISO`) — **confirmed fixed.**
  The guard is `if (Number.isFinite(expireMs) && expireMs > this._nowMs())`
  (node_helper.js:2541), correctly degrading to `anchor: "estimated"` when `EXPIRE_ISO` has
  already elapsed.

I re-ran the probe suite independently: `node scripts/probe-payload-resilience.js` →
`123 passed, 0 failed, 0 skipped`, matching the verification context's claim.

I also verified, rather than re-discovered, the two disclosed open items named in the review
brief:
- The M3 mutation (removing `Math.min(lastGridDay, GRID_DAY_COUNT)` in
  `_addHazardsOutlookGridEntries`) genuinely produces zero RED scenarios in the current
  120→123-scenario suite (18-13-SUMMARY.md's own disclosure, line 103/106) — confirmed as a
  real, still-open coverage hole, not closed by this review.
- The fetch-failure half of WR-01 (a hard fetch failure for `wpc-ero`/`wpc-wssi`/
  `spc-convective`/`spc-fire` still leaves the seeded `"NONE"`/`0` in place, so
  `noteReported` fires even though nothing was actually answered) is recorded open in
  `deferred-items.md` and remains open in current source — confirmed, not re-reported as a
  new finding.

Beyond confirming those four fixes and the two disclosed gaps, I read the Phase 18 merge
functions end to end (`_spcGridAnchor`, `_buildGridDays`, `_addRegistryDayGridEntries`,
`_addHazardsOutlookGridEntries`, `_addHeatRiskGridEntries`, `_addSpcGridEntries`,
`_resolveGridDayPrecedence`, `_buildGridSummary`, `_buildSourceHealth`), the taxonomy's
self-verifying load-time assertions in `hazardTaxonomy.js`, `productRegistry.js`'s derived-span
and shared-reference guards, the frontend's new no-risk-gate terms and renderers in
`MMM-SPCOutlook.js`, and the two new dev-tooling scripts. This is well-hardened, heavily
self-documenting code with load-time integrity assertions on both the taxonomy and the
registry; I found one new defense-in-depth inconsistency, detailed below, and no other
correctness, security, or dead-code issues in the reviewed hunks.

## Warnings

### WR-01: `renderDayBlock`'s color/text interpolate into `innerHTML` without the file's own T-16-19/T-16-20 guards

**File:** `MMM-SPCOutlook.js:604-614`
**Issue:** Every other renderer this phase added or touched in `getDom()` — the Hazards
Outlook day grid (`renderHazardsDays`, lines 664-672), the Hazards Outlook window band
(`renderHazardsWindowBand`, lines 723-727), and the HeatRisk renderer (lines 754-761) — passes
its `color` field through `validHazardColor()` (a `/^[0-9a-fA-F]{6}$/` allowlist, explicitly
justified at line 636 as closing an attribute-injection vector: "an unvalidated `color`
reaching `style="color:#..."` is an attribute injection vector") and its text through
`escapeHtml()`. `renderDayBlock`, the shared renderer this phase introduced for both
`excessiveRain` (ERO) and the new `winterImpact` (WSSI) blocks, does neither:

```javascript
const renderDayBlock = (label, block) => {
  const days = dayRiskCount(block);
  for (let d = 1; d <= days; d++) {
    if (block["day" + d + "Risk"] !== "NONE") {
      wrapper.innerHTML += label + " (Day " + d + "): <span style=\"color:#" +
        block["day" + d + "Color"] + "\">" +
        block["day" + d + "Text"] + "</span><br/>";
    }
  }
};
```

Today this is not exploitable: `day{N}Color`/`day{N}Text` for both ERO and WSSI are populated
by node_helper.js from fixed, module-authored lookup tables (`eroTierToColor`/`eroTierToText`,
`wssiTierToColor`/`wssiTierToText` in productRegistry.js) keyed off a closed tier-token
vocabulary, never from a raw upstream string. But `renderDayBlock` is exactly the kind of
shared, registry-driven renderer this phase's own commentary says should carry no
product-specific assumptions (WR-08's stated rule: "nothing here names a day count or a
product's key layout") — it already generalizes over two products and is the natural landing
spot for a future `arcgis-day-layers` row. Nothing in the function itself enforces that its
inputs stay closed-vocabulary; the invariant is entirely external and undocumented at this
call site, unlike every sibling renderer in the same file, which defends locally regardless of
current provenance.
**Fix:** Route both fields through the same guards used elsewhere in this file:
```javascript
const renderDayBlock = (label, block) => {
  const days = dayRiskCount(block);
  for (let d = 1; d <= days; d++) {
    if (block["day" + d + "Risk"] !== "NONE") {
      wrapper.innerHTML += label + " (Day " + d + "): <span style=\"color:#" +
        validHazardColor(block["day" + d + "Color"]) + "\">" +
        escapeHtml(block["day" + d + "Text"]) + "</span><br/>";
    }
  }
};
```

---

_Reviewed: 2026-09-06T14:52:49Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
