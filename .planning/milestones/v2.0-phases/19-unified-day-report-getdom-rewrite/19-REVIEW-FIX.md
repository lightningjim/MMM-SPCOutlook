---
phase: 19-unified-day-report-getdom-rewrite
fixed_at: 2026-09-08T00:00:00Z
review_path: .planning/phases/19-unified-day-report-getdom-rewrite/19-REVIEW.md
iteration: 4
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 19: Code Review Fix Report (iteration 4)

**Fixed at:** 2026-09-08
**Source review:** `.planning/phases/19-unified-day-report-getdom-rewrite/19-REVIEW.md`
**Iteration:** 4
**Harness:** `node scripts/probe-payload-resilience.js` → `182 passed, 0 failed, 0 skipped` (was 181/0/0 at baseline; +1 scenario, and two existing scenarios gained new parts).

**Summary:**
- Findings in scope: 3 (CR-01, WR-01, WR-02 — Info IN-01..IN-06 out of scope, untouched)
- Fixed: 3
- Skipped: 0

Every fix was mutation-verified RED by reverting it in place and re-running the harness. No assertion was weakened; the two probe changes strengthened existing scenarios rather than relaxing them.

## Fixed Issues

### CR-01: `bandIsTheOnlySummaryTerm` dereferences an unguarded `summary`

**Files modified:** `MMM-SPCOutlook.js`, `scripts/probe-payload-resilience.js`
**Commit:** `1dfd541`

**Applied fix:** `summaryOk &&` now leads the conjunction at `MMM-SPCOutlook.js:1361-1364`, exactly as the review specified. The three `summary.*` reads the BL-01 carve-out added are the only unguarded reads on that branch, and reaching them with `summary` absent threw a `TypeError` out of `getDom()`, losing the whole render — contradicting the invariant asserted at `:1049-1054`. Output is unchanged for every reachable payload: with `summaryOk` false, `unconfirmed` is already true via its own `!summaryOk` term, so the only behaviour removed is the throw. A comment records why `summaryOk` is the semantically right leading term (the carve-out's claim about "the summary's own other two terms" is unassertable without a summary) rather than merely defensive.

**Probe added:** parts (m) and (n) of `cr02-a-summary-that-contradicts-the-render-is-never-a-confident-all-clear`. (m) deletes `payload.summary` and (n) replaces it with a non-object, each beside the scenario's own elapsed band entry over a readable empty grid; both must render `"No Hazards Forecast (unconfirmed)"`. (n) exists so the guard rather than the `delete` is what is pinned — `summaryOk` is the only term that distinguishes a scalar summary. The comment records why 181 green scenarios missed this: no summary-less fixture was ever composed with a non-empty `windowBand`.

**Mutation verified RED:** dropping the leading `summaryOk &&` fails the scenario with `TypeError: Cannot read properties of undefined (reading 'activeDays')` (180 passed / 1 failed).

### WR-01: `wr03-…` part (b) passed for the wrong reason

**Files modified:** `scripts/probe-payload-resilience.js`
**Commit:** `e031460`

**Applied fix:** probe-only, as the review classified it. Part (b) left `summary.anyHazard` at `unifiedPayload`'s false default, so the payload was answered by the confident short-circuit at `MMM-SPCOutlook.js:1090` and never reached the ladder — `enabledAdvisories` and `advisoryEntryDisplayable` were never consulted, despite the comment claiming an assertion about the advisory predicate. The fixture now carries a wholly elapsed band entry plus `bandDiagnostics: { windowBandCount: 1, advisoryCount: 0 }` and `anyHazard: true`, which sets the flag honestly without adding renderable content, so the BL-01 carve-out routes it to the ladder. The assertion itself (`!== "No Hazards Forecast"`) is unchanged.

**Mutation verified RED, and verified on part (b) specifically:** with part (a)'s two assertions temporarily neutralized, the scenario's own stated mutation (drop `.filter(advisoryEntryDisplayable)` from `enabledAdvisories`) now fails on (b) with `got: "No Hazards Forecast (filtered by settings)"` — precisely the claim (b)'s comment makes. Before this change (b) stayed green under that mutation; only (a) carried it.

### WR-02: `also:` rows indented to the nominal dimension width

**Files modified:** `MMM-SPCOutlook.js`, `scripts/probe-payload-resilience.js`
**Commit:** `84895f6`

**Applied fix:** `alsoIndent` is now `" ".repeat(2 + dimensionField.length + 2)`, deriving from the group's own rendered width exactly as `blankDimensionField` does at `:618`. `alsoLabelFieldWidth` is unchanged — it is measured against the label field, which is the same width on both row kinds, so the em dash column reduces to `2 + dimensionField.length + DETAIL_LABEL_FIELD_WIDTH` on both. A comment records the shipped path that made it wrong (an unmapped `dimension` whose payload string overruns the field, 18 D-07) and why both row kinds must derive from one quantity.

**Probe added:** `wr02-also-rows-column-with-the-winner-row-under-an-unmapped-dimension` renders a 29-character unmapped dimension with one winner and one suppressed competitor, strips the colour spans (the column contract is a property of the character stream), and asserts both em dashes land on column 57. A mapped-dimension control asserts the ordinary case still columns at 41, so the fix cannot have shifted it. Both halves carry vacuity guards that fail if either row kind or either em dash is missing.

**Mutation verified RED:** restoring `" ".repeat(2 + DIMENSION_FIELD_WIDTH + 2)` fails with `winner=57, also=41`.

## Notes

- **Info findings IN-01..IN-06 were left untouched**, per scope. They remain valid as re-reported.
- **Logic-change surface:** CR-01 and WR-02 are both source changes whose reachable-output claims were checked rather than assumed. CR-01 changes output only on the previously-throwing path (verified by direct execution through `renderDom`); WR-02 changes output only when `dimensionField.length !== DIMENSION_FIELD_WIDTH`, which the mapped-dimension control pins as unreachable for every mapped group.
- **No duplicate scenario names** introduced (`wr02-also-rows-…` is distinct from the existing `wr02-a-labelless-advisory-entry-…`; the only duplicate `name:` strings in the file are pre-existing fixture layer names, not scenarios).

---

_Fixed: 2026-09-08_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 4_
